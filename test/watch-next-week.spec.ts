import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import {
  startConformanceWatch,
  type ConformanceWatchRecord,
} from "@/services/conformance-watch";
import { startWatch, type StandingWatchRecord } from "@/services/standing-watch";
import { NEVER_RENEWS_ITSELF } from "@/services/watch-next-week";
import { getMenuItem } from "@/store/menu";
import type { Env } from "@/types";
import { installFacilitatorMock } from "./helpers/facilitator-mock";

const BASE = "https://scvd.store";
const testEnv = env as unknown as Env;

beforeAll(() => {
  installFacilitatorMock();
});

/**
 * THE END OF THE WEEK IS SAID ON THE HISTORY (2026-09-01).
 *
 * Rule 23a's carve-out makes both watches bounded: an end date,
 * renewed only by the buyer's next purchase, never by ours. The
 * histories carried the first half of that as `complete` and nothing
 * of the second, so the one product a buyer could sensibly buy again
 * ended in silence on the page buyers come back to. These tests hold
 * the pointer to what it is — a derived, honest "here is the next
 * week, if you want it" — and to what it must never become: a
 * renewal, or a history that grows past its end date.
 */

async function rewindToEnded(key: string): Promise<void> {
  const stored = (await testEnv.ORDERS.get<
    StandingWatchRecord | ConformanceWatchRecord
  >(key, "json"))!;
  stored.ends_at = new Date(Date.now() - 60_000).toISOString();
  await testEnv.ORDERS.put(key, JSON.stringify(stored));
}

function expectPointer(
  next: Record<string, unknown>,
  itemId: "standing_watch" | "conformance_watch",
  url: string,
  ended: boolean,
): void {
  const item = getMenuItem(itemId)!;
  expect(next["ended"]).toBe(ended);
  expect(next["the_rule"]).toBe(NEVER_RENEWS_ITSELF);
  expect(String(next["the_rule"])).toContain("never renews itself");
  // The door is pre-filled, so the next purchase is one request.
  expect(next["buy_url"]).toBe(
    `${BASE}/api/buy/${itemId}?url=${encodeURIComponent(url)}`,
  );
  // Price and term read off the shelf — never typed on the artifact.
  const rung = next["item"] as Record<string, unknown>;
  expect(rung["id"]).toBe(itemId);
  expect(rung["name"]).toBe(item.name);
  expect(rung["price_usdc"]).toBe(item.price_usdc);
  expect(rung["term_days"]).toBe(item.term_days);
  expect(String(rung["price"])).toContain("charges again by itself");
  const now = String(next["what_now"]);
  if (ended) {
    expect(now).toContain("This week is over");
    expect(now).toContain("new history rather than extending this one");
  } else {
    expect(now).toContain("nothing that will be charged");
  }
  // Never the vocabulary of a subscription.
  for (const field of ["the_rule", "what_now"]) {
    expect(String(next[field]).toLowerCase()).not.toContain("auto-renew");
    expect(String(next[field]).toLowerCase()).not.toContain("subscription");
  }
}

describe("the Night Watch history names the next week", () => {
  const url = "https://watched-next.example/api/buy/x";

  it("while running: ends at, nothing charged, the door pre-filled", async () => {
    const { record } = await startWatch(testEnv, url);
    const body = (await (
      await SELF.fetch(`${BASE}/api/watch/${record.watch_id}`)
    ).json()) as Record<string, any>;
    expect(body.complete).toBe(false);
    expectPointer(body.the_next_week, "standing_watch", url, false);
    expect(String(body.the_next_week.what_now)).toContain(body.ends_at);
  });

  it("once over: says so, and that the next week is a new history", async () => {
    const { record } = await startWatch(testEnv, url);
    await rewindToEnded(KV_KEYS.standingWatch(record.watch_id));
    const body = (await (
      await SELF.fetch(`${BASE}/api/watch/${record.watch_id}`)
    ).json()) as Record<string, any>;
    expect(body.complete).toBe(true);
    expectPointer(body.the_next_week, "standing_watch", url, true);
  });

  it("the readable twin carries the same section and the same link", async () => {
    const { record } = await startWatch(testEnv, url);
    await rewindToEnded(KV_KEYS.standingWatch(record.watch_id));
    const page = await (
      await SELF.fetch(`${BASE}/api/watch/${record.watch_id}`, {
        headers: { Accept: "text/html" },
      })
    ).text();
    expect(page).toContain("When the week is over");
    expect(page).toContain("This week is over");
    expect(page).toContain(
      `href="${BASE}/api/buy/standing_watch?url=${encodeURIComponent(url)}"`,
    );
    expect(page).toContain(getMenuItem("standing_watch")!.name);
  });
});

describe("the Conformance Watch history names the next week", () => {
  const url = "https://merchant-next.example/api/buy/thing";

  it("while running", async () => {
    const { record } = await startConformanceWatch(testEnv, url);
    const body = (await (
      await SELF.fetch(`${BASE}/api/conformance-watch/${record.watch_id}`)
    ).json()) as Record<string, any>;
    expect(body.complete).toBe(false);
    expectPointer(body.the_next_week, "conformance_watch", url, false);
  });

  it("once over", async () => {
    const { record } = await startConformanceWatch(testEnv, url);
    await rewindToEnded(KV_KEYS.conformanceWatch(record.watch_id));
    const body = (await (
      await SELF.fetch(`${BASE}/api/conformance-watch/${record.watch_id}`)
    ).json()) as Record<string, any>;
    expect(body.complete).toBe(true);
    expectPointer(body.the_next_week, "conformance_watch", url, true);
  });
});
