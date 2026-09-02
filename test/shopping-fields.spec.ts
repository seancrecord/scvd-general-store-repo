import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { MENU_ITEMS } from "@/store";
import { ROUTES } from "@/lib/when-to-buy";
import { SAMPLES } from "@/services/sample-artifacts";
import { sampleUrlFor, shoppingFields, verifyPattern, whenFor } from "@/lib/shopping-fields";

/**
 * ROADMAP S6 (2026-09-02): the shopping fields on menu.json and the
 * atlas, derived from the three places the store already held them
 * and typed nowhere new. What this file holds:
 *
 *   - `when` on every item is the routing table reversed, in its
 *     order, free instrument first where the route names one;
 *   - `sample_url` is the specimen roster, and the item's own typed
 *     sample_url agrees with it wherever the roster has an entry;
 *   - `verify` is one pattern, the same on every item;
 *   - menu.json and the atlas carry the same fields from the same
 *     derivation, so the two cannot drift;
 *   - no new category list: the fields go empty when their sources do.
 */

const BASE = "https://scvd.store";

describe("the derivation", () => {
  it("reverses the routing table per item, in the table's order, free first where named", () => {
    for (const item of MENU_ITEMS) {
      const expected = ROUTES.filter((route) => route.items.includes(item.id));
      const when = whenFor(item.id);
      expect(when.map((entry) => entry.job)).toEqual(expected.map((route) => route.job));
      for (const [index, entry] of when.entries()) {
        const route = expected[index]!;
        if (route.free) expect(entry.free_first).toBe(route.free);
        else expect(entry.free_first).toBeUndefined();
      }
    }
  });

  it("gives every shelf item at least one situation, because the routing table routes every item", () => {
    const silent = MENU_ITEMS.filter((item) => whenFor(item.id).length === 0).map((item) => item.id);
    expect(silent, "an item with no `when` is one the routing table forgot; test/when-to-buy.spec.ts should already have said so").toEqual([]);
  });

  it("reads the specimen roster and nothing else for sample_url", () => {
    for (const listing of SAMPLES) {
      expect(sampleUrlFor(listing.item, BASE)).toBe(`${BASE}/samples/${listing.slug}.json`);
    }
    const unsampled = MENU_ITEMS.find((item) => !SAMPLES.some((listing) => listing.item === item.id))!;
    expect(sampleUrlFor(unsampled.id, BASE)).toBeNull();
    expect(shoppingFields(unsampled.id, BASE)).not.toHaveProperty("sample_url");
  });

  it("the item's own typed sample_url agrees with the roster wherever the roster has one", () => {
    const drift: string[] = [];
    for (const listing of SAMPLES) {
      const item = MENU_ITEMS.find((entry) => entry.id === listing.item);
      if (!item) {
        drift.push(`${listing.item}: the roster names an item that is not on the shelf`);
        continue;
      }
      if (item.sample_url !== `/samples/${listing.slug}.json`) {
        drift.push(`${listing.item}: the item says ${item.sample_url ?? "nothing"}, the roster says /samples/${listing.slug}.json`);
      }
    }
    expect(drift).toEqual([]);
  });

  it("names one verify pattern, and it is the free door", () => {
    expect(verifyPattern(BASE)).toBe(`${BASE}/api/verify/{cert_id}`);
    for (const item of MENU_ITEMS) {
      expect(shoppingFields(item.id, BASE).verify).toBe(verifyPattern(BASE));
    }
  });
});

describe("the two surfaces carry the same fields from the same derivation", () => {
  it("menu.json: when, verify, and sample_url where a specimen exists", async () => {
    const body = (await (await SELF.fetch(`${BASE}/menu.json`)).json()) as {
      items: { id: string; when: unknown; verify: string; sample_url?: string }[];
    };
    expect(body.items.length).toBe(MENU_ITEMS.length);
    for (const row of body.items) {
      const expected = shoppingFields(row.id, BASE);
      expect(row.when).toEqual(expected.when);
      expect(row.verify).toBe(expected.verify);
      if (expected.sample_url) expect(row.sample_url).toBe(expected.sample_url);
    }
  });

  it("the atlas: the same three, beside a buy_url and a listing_url per paid door", async () => {
    const body = (await (await SELF.fetch(`${BASE}/atlas.json`)).json()) as {
      doors: { paid: { id: string; when: unknown; verify: string; sample_url?: string; buy_url: string; listing_url: string }[] };
    };
    expect(body.doors.paid.length).toBe(MENU_ITEMS.length);
    for (const door of body.doors.paid) {
      const expected = shoppingFields(door.id, BASE);
      expect(door.when).toEqual(expected.when);
      expect(door.verify).toBe(expected.verify);
      expect(door.sample_url).toBe(expected.sample_url);
      expect(door.buy_url).toBe(`${BASE}/api/buy/${door.id}`);
      expect(door.listing_url).toBe(`${BASE}/menu/${door.id}`);
    }
  });

  it("the item page prints the same verify pattern the JSON carries", async () => {
    const html = await (
      await SELF.fetch(`${BASE}/menu/service_audit`, { headers: { Accept: "text/html" } })
    ).text();
    expect(html).toContain(verifyPattern(BASE));
  });

  it("the free instrument comes first on a job that has one — routing is not selling", async () => {
    const body = (await (await SELF.fetch(`${BASE}/menu.json`)).json()) as {
      items: { id: string; when: { job: string; free_first?: string }[] }[];
    };
    const audit = body.items.find((row) => row.id === "service_audit")!;
    const preflightJob = audit.when.find((entry) => entry.free_first);
    expect(preflightJob?.free_first).toContain("free");
  });
});
