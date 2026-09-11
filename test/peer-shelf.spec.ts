import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { KV_KEYS, currentWeekKey, previousWeekKey } from "@/lib/kv-keys";
import {
  OUR_X402_LIST_SLUG,
  PEER_PAGE_CAP,
  X402_LIST_API,
  deriveShelf,
  ensureWeekPeerShelf,
  peerRowOf,
  readCategoryRows,
  readPeerShelf,
  readPeerShelves,
  takePeerShelf,
  type PeerRow,
} from "@/services/peer-shelf";
import type { Env } from "@/types";

/**
 * THE PEER SHELF (2026-09-11). What this file holds:
 *
 *   - a directory row becomes ours with the measured floor kept and
 *     an unmeasured one kept as unmeasured, never zero;
 *   - the category is read off OUR row, never typed, and a read that
 *     cannot find it is no reading at all;
 *   - the shelf is alphabetical, carries the totals and our share per
 *     hundred with the denominator, and names who arrived and left
 *     against the week before;
 *   - a week is taken once and found frozen after;
 *   - the page renders behind the keeper's door with the attribution
 *     the licence asks for, and never a rank.
 */

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const AUTH = { Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`, Accept: "text/html" };
const NOW = new Date("2026-09-11T12:00:00.000Z");
const WEEK = currentWeekKey(NOW);

function directoryRow(slug: string, name: string, traction: Record<string, unknown> | null, category = "Verification"): Record<string, unknown> {
  return {
    slug,
    name,
    base_url: `https://${slug}.example`,
    category,
    status: "online",
    payment_ready: true,
    created_at: "2026-08-01T00:00:00.000Z",
    assessment: {
      category_percentile: 12,
      traction: traction ?? { status: "no_settlements_measured" },
    },
  };
}

const measured = (volume: number, tx: number, buyers: number) => ({
  status: "measured",
  volume_usd_30d: volume,
  tx_count_30d: tx,
  unique_buyers_30d: buyers,
  top_buyer_share_30d: 0.5,
  trend_7d_vs_30d: 1.25,
  volume_usd_all_time: volume * 2,
  first_settlement_at: "2026-07-22T16:16:13Z",
  caveat: "Conservative undercount: a measured floor, not an estimate.",
});

function fetcher(rows: Record<string, unknown>[], ourCategory: string | null = "Verification", totalPages = 1) {
  const calls: string[] = [];
  const impl = async (url: string): Promise<unknown | null> => {
    calls.push(url);
    if (url.startsWith(`${X402_LIST_API}/services/${OUR_X402_LIST_SLUG}`)) {
      return ourCategory ? { data: directoryRow(OUR_X402_LIST_SLUG, "Our store", measured(1000, 192, 14), ourCategory) } : null;
    }
    if (url.startsWith(`${X402_LIST_API}/services?`)) {
      const page = Number(new URL(url).searchParams.get("page") ?? "1");
      return { data: page === 1 ? rows : [directoryRow(`page-${page}`, `Page ${page}`, null)], meta: { total_pages: totalPages, page } };
    }
    return null;
  };
  return { impl, calls };
}

const PEERS = [
  directoryRow("zeta-verify", "Zeta Verify", measured(250, 40, 3)),
  directoryRow(OUR_X402_LIST_SLUG, "Our store", measured(1000, 192, 14)),
  directoryRow("alpha-check", "Alpha Check", measured(750, 300, 9)),
  directoryRow("quiet-desk", "Quiet Desk", null),
];

describe("a directory row, kept", () => {
  it("keeps the measured floor and keeps unmeasured as unmeasured, never zero", () => {
    const row = peerRowOf(PEERS[0])!;
    expect(row).toMatchObject({ slug: "zeta-verify", name: "Zeta Verify", host: "zeta-verify.example", listed_at: "2026-08-01T00:00:00.000Z" });
    expect(row.traction).toMatchObject({ volume_usd_30d: 250, tx_count_30d: 40, unique_buyers_30d: 3, trend_7d_vs_30d: 1.25 });
    const quiet = peerRowOf(PEERS[3])!;
    expect(quiet.traction).toBeNull();
    expect(quiet.traction_status).toBe("no_settlements_measured");
    expect(peerRowOf({ name: "no slug" })).toBeNull();
    // The directory's percentile is a rank wearing a number; it does not travel.
    expect(JSON.stringify(row)).not.toContain("percentile");
  });
});

describe("the category, read off our own row", () => {
  it("reads our row for the category, then the category's pages, and keeps their caveat", async () => {
    const { impl, calls } = fetcher(PEERS);
    const read = (await readCategoryRows(impl))!;
    expect(read.category).toBe("Verification");
    expect(read.rows.map((r) => r.slug)).toEqual(["zeta-verify", OUR_X402_LIST_SLUG, "alpha-check", "quiet-desk"]);
    expect(read.truncated).toBe(false);
    expect(read.caveat).toContain("measured floor");
    expect(calls[0]).toContain(`/services/${OUR_X402_LIST_SLUG}`);
    expect(calls[1]).toContain("category=Verification");
  });

  it("is no reading at all when our row cannot be read, and a floor past the page cap", async () => {
    expect(await readCategoryRows(fetcher(PEERS, null).impl)).toBeNull();
    const wide = (await readCategoryRows(fetcher(PEERS, "Verification", PEER_PAGE_CAP + 3).impl))!;
    expect(wide.truncated).toBe(true);
    expect(wide.rows.length).toBe(PEERS.length + PEER_PAGE_CAP - 1);
  });
});

describe("the shelf, derived", () => {
  const rows = PEERS.map((raw) => peerRowOf(raw)!) as PeerRow[];

  it("is alphabetical, totals the measured floors, and states our share per hundred with its denominator", () => {
    const shelf = deriveShelf(WEEK, NOW.toISOString(), "Verification", rows, null, false, null);
    expect(shelf.rows.map((r) => r.name)).toEqual(["Alpha Check", "Our store", "Quiet Desk", "Zeta Verify"]);
    expect(shelf.totals).toEqual({ services: 4, measured: 3, volume_usd_30d: 2000, tx_count_30d: 532, buyers_30d_summed: 26 });
    expect(shelf.ours?.slug).toBe(OUR_X402_LIST_SLUG);
    expect(shelf.ours_per_hundred).toEqual({ volume: 50, settlements: 36.1 });
    expect(shelf.arrived).toBeNull();
    expect(shelf.departed).toBeNull();
    expect(shelf.source.attribution).toContain("CC BY 4.0");
    const keys: string[] = [];
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) node.forEach(walk);
      else if (node && typeof node === "object") for (const [key, value] of Object.entries(node)) { keys.push(key); walk(value); }
    };
    walk(shelf);
    expect(keys.some((key) => /rank|score|percentile/i.test(key))).toBe(false);
  });

  it("names who arrived and who left against the week before", () => {
    const before = deriveShelf(previousWeekKey(WEEK), NOW.toISOString(), "Verification", rows.filter((r) => r.slug !== "alpha-check"), null, false, null);
    const later = deriveShelf(WEEK, NOW.toISOString(), "Verification", rows.filter((r) => r.slug !== "quiet-desk"), before, false, null);
    expect(later.arrived).toEqual(["alpha-check"]);
    expect(later.departed).toEqual(["quiet-desk"]);
  });

  it("has no share when we are unmeasured, and says so rather than printing zero", () => {
    const unmeasured = rows.map((r) => (r.slug === OUR_X402_LIST_SLUG ? { ...r, traction: null, traction_status: "no_settlements_measured" } : r));
    const shelf = deriveShelf(WEEK, NOW.toISOString(), "Verification", unmeasured, null, false, null);
    expect(shelf.ours_per_hundred).toBeNull();
    expect(shelf.ours?.traction).toBeNull();
  });
});

describe("the press", () => {
  it("takes the week once, finds it frozen after, and stores nothing on a failed read", async () => {
    await testEnv.COUNTERS.delete(KV_KEYS.peerShelf(WEEK));
    const { impl, calls } = fetcher(PEERS);
    const first = await ensureWeekPeerShelf(testEnv, NOW, impl);
    expect(first?.week).toBe(WEEK);
    expect((await readPeerShelf(testEnv, WEEK))?.totals.services).toBe(4);
    const callsAfterFirst = calls.length;
    const second = await ensureWeekPeerShelf(testEnv, NOW, impl);
    expect(second?.read_at).toBe(first?.read_at);
    expect(calls.length).toBe(callsAfterFirst);

    const failedWeek = new Date("2026-10-01T00:00:00.000Z");
    expect(await takePeerShelf(testEnv, failedWeek, fetcher(PEERS, null).impl)).toBeNull();
    expect(await readPeerShelf(testEnv, currentWeekKey(failedWeek))).toBeNull();
  });

  it("lists every week read, newest first, and the page renders them behind the keeper's door with the attribution", async () => {
    const { impl } = fetcher(PEERS);
    await takePeerShelf(testEnv, new Date("2026-09-04T12:00:00.000Z"), impl);
    await takePeerShelf(testEnv, NOW, impl);
    const shelves = await readPeerShelves(testEnv);
    expect(shelves.map((s) => s.week).slice(0, 2)).toEqual([WEEK, previousWeekKey(WEEK)]);

    const page = await SELF.fetch(`${BASE}/admin/peers`, { headers: AUTH });
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("Verification shelf on x402-list");
    expect(html).toContain("Data: x402-list.com (CC BY 4.0)");
    expect(html).toContain("Alpha Check");
    expect(html).toContain("<strong>Our store</strong>");
    expect(html).toContain("ours per hundred");
    // The page says "not a ranking" and then prints none: no rank column, no ordinal.
    expect(html).not.toContain("<th>rank");
    expect(html).not.toMatch(/#\s?1\b/);

    const json = await SELF.fetch(`${BASE}/admin/peers.json`, { headers: AUTH });
    expect(json.status).toBe(200);
    expect(((await json.json()) as { week: string }[])[0]?.week).toBe(WEEK);
    expect((await SELF.fetch(`${BASE}/admin/peers.json`)).status).toBe(401);
  });
});
