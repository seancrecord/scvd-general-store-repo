import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { NEIGHBOUR_RECEIPTS } from "@/store/neighbours";
import {
  daysSinceChecked,
  entryFreshness,
  TRUST_LIST_ENTRIES,
} from "@/store/trust-list";

/**
 * THE COMPARISON TABLE THAT ISN'T AN ADVERTISEMENT.
 *
 * The keeper's idea, 2026-07-29: agents quote tables, so publish one.
 * The gimmick version lists everyone else's flaws — which the trust
 * list already refuses to do in the positive direction, because a
 * prediction about somebody else's behaviour signed with our key is
 * exactly what that scope guard exists to prevent. A flaw table is the
 * same claim with the sign flipped, and it is the one thing this store
 * publishes that no stranger could check.
 *
 * So: receipts only. These tests hold that line, because the line is
 * the whole difference between a useful page and a press release.
 */
describe("/neighbours", () => {
  it("carries no row without a purchase behind it", async () => {
    for (const row of NEIGHBOUR_RECEIPTS) {
      expect(row.paid_usdc, `${row.name} is listed without a payment`).toBeGreaterThan(0);
      expect(row.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(row.bought_by.length).toBeGreaterThan(0);
      expect(row.came_back.length).toBeGreaterThan(0);
    }
  });

  it("never rates, ranks, or recommends anyone", async () => {
    // The trust list's scope guard, applied to the mirror image. These
    // words are predictions about someone else's future; the store does
    // not sign those, in either direction.
    const body = await (await SELF.fetch("https://scvd.store/neighbours")).json();
    const served = JSON.stringify(body).toLowerCase();
    for (const forbidden of [
      "we recommend",
      "best in class",
      "avoid ",
      "worst",
      "inferior",
    ]) {
      expect(served, `the page reaches for "${forbidden}"`).not.toContain(
        forbidden,
      );
    }
  });

  it("leads with our own bad number", async () => {
    // A comparison page written by an interested party is worth reading
    // only if the author's own worst result is on it, first.
    const first = NEIGHBOUR_RECEIPTS[0];
    expect(first?.we_asked).toContain("THIS store");
    expect(first?.came_back).toContain("63/100");
  });

  it("says that absence from the list means nothing about a service", async () => {
    const body = (await (
      await SELF.fetch("https://scvd.store/neighbours")
    ).json()) as Record<string, unknown>;
    expect(String(body.coverage)).toContain("says nothing about a service");
    // And how to get a row fixed, without an argument.
    expect(String(body.corrections)).toContain("/api/letter");
  });
});

describe("the trust list says how old its checks are", () => {
  it("computes an age and a reading for every entry", async () => {
    const body = (await (
      await SELF.fetch("https://scvd.store/trust-list.json")
    ).json()) as Record<string, unknown>;
    const entries = body.entries as {
      days_since_checked: number;
      freshness: string;
    }[];
    expect(entries.length).toBe(TRUST_LIST_ENTRIES.length);
    for (const entry of entries) {
      expect(typeof entry.days_since_checked).toBe("number");
      expect(["recent", "aging", "stale"]).toContain(entry.freshness);
    }
  });

  it("reads a stale entry as a fact about us, not a warning about them", async () => {
    const body = (await (
      await SELF.fetch("https://scvd.store/trust-list.json")
    ).json()) as Record<string, unknown>;
    const policy = body.freshness_policy as Record<string, unknown>;
    expect(String(policy.note)).toContain("NOT A WARNING ABOUT THE SERVICE");
    expect(String(policy.note)).toContain("a fact about us");
  });

  it("ages an old check into stale rather than letting it sit silently", () => {
    const entry = TRUST_LIST_ENTRIES[0];
    expect(entry).toBeTruthy();
    const wayLater = new Date(
      Date.parse(`${entry?.last_checked}T00:00:00.000Z`) + 400 * 86_400_000,
    );
    expect(daysSinceChecked(entry as never, wayLater)).toBeGreaterThan(300);
    expect(entryFreshness(entry as never, wayLater)).toBe("stale");
  });
});
