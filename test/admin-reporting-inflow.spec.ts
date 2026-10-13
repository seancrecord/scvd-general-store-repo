import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, expect, it, vi } from "vitest";
import { app } from "@/index";
import * as inflows from "@/services/inflow-census";
import * as pulse from "@/services/inflow-pulse";
import type { Env } from "@/types";

const bindings = env as unknown as Env;
const fixture = (): inflows.InflowCensus => ({
  observed_at: "2026-10-13T12:00:00Z", week: "2026-W42",
  addresses_advertised: 200, addresses_checked: 200, addresses_capped: false,
  addresses_received: 48, transfers_seen: 60, windows_equal: true,
  distribution: { median_transfers: 1, max_transfers: 4, top_decile_share_pct: null },
  by_exclusivity: { sole: { watched: 100, received: 17, transfers: 20 }, shared: { watched: 100, received: 31, transfers: 40 } },
  amounts: { median_usdc: 1, under_1_usdc: 0, under_10_usdc: 60, over_100_usdc: 0 },
  in_quoted_band: { transfers: 0, addresses: 0, sole_addresses: 0 },
  senders: { distinct: 5, top_sender_share_pct: null, median_senders_per_receiver: 1, single_sender_receivers: 48, from_advertised: 0, broadcasters: 0, broadcaster_transfers: 0, broadcaster_share_pct: null },
  narrowest: { watched: 100, multi_payer_in_band: 0, transfers: 0, median_payers: 0 },
  windows: [{ chain: "Base", from_block: 1, to_block: 100, blocks: 100, calls: 1, truncated: false, received: 48, transfers: 60, addresses_unread: 0, advertised_here: 200, received_advertised: 48, received_unadvertised: 0 }],
  what_this_counts: "Observed transfers", what_this_is_not: "Not proof of sales",
});
afterEach(() => vi.restoreAllMocks());
async function page(census: inflows.InflowCensus) {
  vi.spyOn(inflows, "readInflowCensus").mockResolvedValue(census);
  vi.spyOn(pulse, "stashRenderedReading").mockResolvedValue(undefined);
  vi.spyOn(pulse, "readInflowPulse").mockResolvedValue({ version: 1, weeks: [] });
  const ctx = createExecutionContext();
  const res = await app.fetch(new Request("https://scvd.store/admin/market/inflows", {
    headers: { Authorization: `Basic ${btoa(`keeper:${bindings.ADMIN_PASSWORD}`)}`, Accept: "text/html" },
  }), bindings, ctx);
  await waitOnExecutionContext(ctx);
  expect(res.status).toBe(200);
  return res.text();
}
it.each(["unequal", "capped", "unread", "truncated"])("withholds activity percentages throughout a %s reading", async kind => {
  const census = fixture();
  if (kind === "unequal") census.windows_equal = false;
  if (kind === "capped") census.addresses_capped = true;
  if (kind === "unread") census.windows[0]!.addresses_unread = 1;
  if (kind === "truncated") census.windows[0]!.truncated = true;
  const html = await page(census);
  expect(html).not.toContain("17%");
  expect(html).not.toContain("31%");
  expect(html).toContain("17 of 100");
  expect(html).toContain("31 of 100");
  expect(html).toContain("floor, not a rate");
});
it("keeps rates when the address set and window are complete", async () => {
  const html = await page(fixture());
  expect(html).toContain("17%");
  expect(html).toContain("31%");
});

it.each([true, false])("the recount handler derives serialized=%s from its actual binding", async serialized => {
  const ctx = createExecutionContext();
  const config = { ...bindings, COUNTER_LEDGER: serialized ? bindings.COUNTER_LEDGER : undefined };
  const res = await app.fetch(new Request("https://scvd.store/admin/recount", {
    headers: { Authorization: `Basic ${btoa(`keeper:${bindings.ADMIN_PASSWORD}`)}` },
  }), config, ctx);
  await waitOnExecutionContext(ctx);
  expect(res.status).toBe(200);
  expect(await res.text()).toContain(serialized ? "Current writer: serialized" : "Current writer: KV read-add-write");
});
