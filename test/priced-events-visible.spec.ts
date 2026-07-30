import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  listRecentPricedEvents,
  recordChallengeIssued,
  recordSettlement,
} from "@/lib/metrics";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const adminAuth = {
  Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
};

/**
 * A SETTLE HAS ITS OWN ROW NOW.
 *
 * The keeper's second finding on the day of the first organic settle:
 * the Sources table put it under "direct" while the per-event table on
 * the same page said "unknown", and the two read as a contradiction.
 *
 * NEITHER WAS WRONG. A 402 and its settlement are two different HTTP
 * requests — the first carries no payment header, the second carries the
 * signature — and they can arrive with different headers, so they can
 * land in different channels honestly. A bare fetch that reads a price
 * and then retries through a client library that sets a user-agent is
 * "unknown" going in and "direct" coming through.
 *
 * The real defect was that NO SURFACE SHOWED A SETTLE'S OWN ROW, so the
 * nearest row — its challenge — got read as the purchase. A page that
 * makes a correct number look like a contradiction costs as much as a
 * wrong one and is harder to stop believing.
 */
describe("the settle is visible as itself", () => {
  it("appears in the recent priced events, not only as a counter", async () => {
    await recordSettlement(testEnv, "/api/buy/hello", {
      userAgent: "settle-row-spec/1.0",
      paidUsdc: 0.5,
      minimumUsdc: 0.5,
      payer: "0x7777777777777777777777777777777777777777",
    });
    const events = await listRecentPricedEvents(testEnv, 50);
    const settle = events.find(
      (event) =>
        event.kind === "settle" && event.user_agent === "settle-row-spec/1.0",
    );
    expect(settle, "a settle has no row of its own anywhere").toBeTruthy();
    expect(settle?.channel).toBeTruthy();
  });

  it("labels which kind each row is, since they are different requests", async () => {
    const page = await (
      await SELF.fetch(`${BASE}/admin`, { headers: adminAuth })
    ).text();
    expect(page).toContain("settled");
    expect(page).toContain("402s, settles and declines");
  });

  it("says on the page why a 402 and its settle can differ", async () => {
    // The sentence that stops the next reader filing the same
    // reconciliation bug against numbers that are both correct.
    const page = await (
      await SELF.fetch(`${BASE}/admin`, { headers: adminAuth })
    ).text();
    expect(page).toContain("two different requests");
    expect(page).toContain("without either being wrong");
  });

  it("still shows the 402s it always showed", async () => {
    // Widening the reader must not have narrowed it: the challenge rows
    // were the whole point of the table before, and still are.
    await recordChallengeIssued(testEnv, "/api/buy/hello", {
      userAgent: "challenge-row-spec/1.0",
    });
    const events = await listRecentPricedEvents(testEnv, 50);
    expect(
      events.some(
        (event) =>
          event.kind === "challenge" &&
          event.user_agent === "challenge-row-spec/1.0",
      ),
    ).toBe(true);
  });
});
