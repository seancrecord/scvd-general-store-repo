import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  catalogLastUpdated,
  daysSinceUpdate,
  freshness,
  STALE_AFTER_DAYS,
} from "@/lib/freshness";
import directoryData from "@/store/directory.json";
import { TRUST_LIST_ENTRIES } from "@/store/trust-list";
import { NEIGHBOUR_RECEIPTS } from "@/store/neighbours";
import { isRecord } from "@/types";

const BASE = "https://scvd.store";

/**
 * THE TOWNE WORK: a listing a neighbor cannot link to is a listing
 * nobody has a reason to want, and having a reason to want one is the
 * whole supplier ladder.
 */
describe("the town directory", () => {
  it("gives every neighbor a page of their own", async () => {
    for (const listing of directoryData.listings) {
      const response = await SELF.fetch(`${BASE}/directory/${listing.slug}`);
      expect(response.status, listing.slug).toBe(200);
      const body: unknown = await response.json();
      if (!isRecord(body)) throw new Error("no body");
      expect(body.name).toBe(listing.name);
      expect(body.listing_url).toBe(`${BASE}/directory/${listing.slug}`);
    }
  });

  it("says whether a review is an opinion or a signed observation", async () => {
    const body: unknown = await (
      await SELF.fetch(`${BASE}/directory/x402scan`)
    ).json();
    if (!isRecord(body) || !isRecord(body.trust_list)) {
      throw new Error("no trust_list block");
    }
    // x402scan is on the signed list, unpaid — and the entry says so
    // rather than letting a reader assume money changed hands.
    expect(body.trust_list.listed).toBe(true);
    expect(body.trust_list.relation).toBe("used");
  });

  it("refuses a name that is not in the book, instead of guessing", async () => {
    const response = await SELF.fetch(`${BASE}/directory/not-a-neighbor`);
    expect(response.status).toBe(404);
  });

  it("says on every surface that placement cannot be bought", async () => {
    const body: unknown = await (await SELF.fetch(`${BASE}/directory`)).json();
    if (!isRecord(body)) throw new Error("no body");
    expect(String(body.no_pay_for_placement).toLowerCase()).toContain("no fee");
  });

  it("puts each listing in the sitemap, derived rather than hand-listed", async () => {
    const xml = await (await SELF.fetch(`${BASE}/sitemap.xml`)).text();
    for (const listing of directoryData.listings) {
      expect(xml, listing.slug).toContain(
        `${BASE}/directory/${listing.slug}</loc>`,
      );
    }
  });

  /**
   * THE SEPTEMBER CATCH-UP (2026-09-20). Eighteen listings arrived out
   * of /neighbours at once, and every one of them was paid for. The
   * old copy told any listing off the signed trust list that "nothing
   * about this neighbor is signed" — which for a row resting on a
   * Solana mainnet signature is a false negative about our own
   * evidence. These hold the two instruments apart without either one
   * denying the other.
   */
  it("points a bought line at its receipt rather than calling it unsigned", async () => {
    const bought = directoryData.listings.filter((listing) =>
      NEIGHBOUR_RECEIPTS.some(
        (row) => new URL(row.origin).origin === new URL(listing.url).origin,
      ),
    );
    // The catch-up is the point: if this is zero the test proves nothing.
    expect(bought.length).toBeGreaterThan(0);
    for (const listing of bought) {
      const receipt = NEIGHBOUR_RECEIPTS.find(
        (row) => new URL(row.origin).origin === new URL(listing.url).origin,
      );
      const body: unknown = await (
        await SELF.fetch(`${BASE}/directory/${listing.slug}`)
      ).json();
      if (!isRecord(body) || !isRecord(body.receipt) || !isRecord(body.trust_list)) {
        throw new Error(`no receipt block on ${listing.slug}`);
      }
      expect(body.receipt.paid, listing.slug).toBe(true);
      expect(body.receipt.date, listing.slug).toBe(receipt?.date);
      expect(body.receipt.paid_usdc, listing.slug).toBe(receipt?.paid_usdc);
      expect(body.receipt.receipts_url, listing.slug).toBe(`${BASE}/neighbours`);
      // The denial the receipt disproves must not survive beside it.
      expect(String(body.trust_list.note), listing.slug).not.toContain(
        "nothing about this neighbor is signed",
      );
    }
  });

  it("claims no receipt for a listing nobody bought from", async () => {
    const unbought = directoryData.listings.filter(
      (listing) =>
        !NEIGHBOUR_RECEIPTS.some(
          (row) => new URL(row.origin).origin === new URL(listing.url).origin,
        ),
    );
    expect(unbought.length).toBeGreaterThan(0);
    for (const listing of unbought) {
      const body: unknown = await (
        await SELF.fetch(`${BASE}/directory/${listing.slug}`)
      ).json();
      if (!isRecord(body)) throw new Error("no body");
      expect(body.receipt, listing.slug).toBeUndefined();
    }
  });

  it("says on the human page what the JSON says about a purchase", async () => {
    const html = await (
      await SELF.fetch(`${BASE}/directory/sniperx`, {
        headers: { Accept: "text/html" },
      })
    ).text();
    expect(html).toContain("Written after a purchase");
    expect(html).toContain("/neighbours");
  });

  it("says the same thing about itself on the paper page and the twin", async () => {
    const html = await (
      await SELF.fetch(`${BASE}/directory`, { headers: { Accept: "text/html" } })
    ).text();
    const markdown = await (
      await SELF.fetch(`${BASE}/directory`, { headers: { Accept: "text/markdown" } })
    ).text();
    const said = "Who we&#39;ve been seeing about town";
    expect(html).toContain(said);
    expect(markdown).toContain("Who we've been seeing about town");
    // The line that stopped being true when the book went to twenty-two.
    expect(html).not.toContain("kept short on purpose");
    expect(markdown).not.toContain("kept short on purpose");
  });

  it("keeps every listing reachable under a slug of its own", () => {
    const slugs = directoryData.listings.map((listing) => listing.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("marks up reviews as reviews, with a named author and a date", async () => {
    const html = await (
      await SELF.fetch(`${BASE}/directory`, {
        headers: { Accept: "text/html" },
      })
    ).text();
    expect(html).toContain('"@type":"Review"');
    expect(html).toContain('"itemReviewed"');
    expect(html).toContain('"datePublished"');
  });
});

/**
 * AEO/GEO: the surfaces agents read are the ones nobody visits, so a
 * date is the only way a reader can tell a maintained store from an
 * abandoned one.
 */
describe("freshness, on every machine surface", () => {
  it("derives the date instead of trusting anyone to remember", () => {
    const stamped = catalogLastUpdated();
    expect(stamped).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // It is the newest date the catalog carries, so adding a neighbor
    // or re-checking a trust entry moves it with no extra step.
    const known = [
      directoryData.updated,
      ...directoryData.listings.map((listing) => listing.added),
      ...TRUST_LIST_ENTRIES.map((entry) => entry.last_checked),
    ];
    for (const date of known) {
      expect(stamped >= date.slice(0, 10), `${date} is newer than as_of`).toBe(
        true,
      );
    }
  });

  it("keeps as_of and checked_at as separate facts", () => {
    const block = freshness(new Date("2027-01-01T00:00:00.000Z"));
    // Serving a page today is not the same as having verified it today.
    // Collapsing these two would be the small lie the module exists to
    // prevent, so the test pins them apart.
    expect(block.checked_at).toBe("2027-01-01T00:00:00.000Z");
    expect(block.as_of).toBe(catalogLastUpdated());
    expect(block.as_of).not.toBe(block.checked_at);
  });

  it("reports staleness honestly rather than only when it flatters us", () => {
    const wayLater = new Date(
      Date.parse(`${catalogLastUpdated()}T00:00:00.000Z`) +
        (STALE_AFTER_DAYS + 5) * 86400000,
    );
    expect(daysSinceUpdate(wayLater)).toBe(STALE_AFTER_DAYS + 5);
  });

  it("dates llms.txt, and says which date is which", async () => {
    const text = await (await SELF.fetch(`${BASE}/llms.txt`)).text();
    expect(text).toContain(`Last checked by hand: ${catalogLastUpdated()}`);
    expect(text).toContain("Served:");
  });

  it("dates menu.json and the discovery document", async () => {
    for (const path of ["/menu.json", "/.well-known/x402.json"]) {
      const body: unknown = await (await SELF.fetch(`${BASE}${path}`)).json();
      if (!isRecord(body)) throw new Error(`no body for ${path}`);
      expect(body.as_of, path).toBe(catalogLastUpdated());
      expect(typeof body.checked_at, path).toBe("string");
    }
  });

  it("gives a crawler a lastmod to decide on", async () => {
    const xml = await (await SELF.fetch(`${BASE}/sitemap.xml`)).text();
    expect(xml).toContain(`<lastmod>${catalogLastUpdated()}</lastmod>`);
  });

  it("dates the structured data the answer engines read", async () => {
    const storefront = await (
      await SELF.fetch(BASE, { headers: { Accept: "text/html" } })
    ).text();
    expect(storefront).toContain(`"dateModified":"${catalogLastUpdated()}"`);

    const what = await (
      await SELF.fetch(`${BASE}/what`, { headers: { Accept: "text/html" } })
    ).text();
    expect(what).toContain(`"dateModified":"${catalogLastUpdated()}"`);
  });
});
