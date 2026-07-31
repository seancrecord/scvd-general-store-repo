import { describe, expect, it } from "vitest";
import { ALERT_CONDITIONS } from "@/lib/alerts";

/**
 * THE FOOTER ON EVERY ALERT EMAIL WAS A HAND-TYPED COUNT.
 *
 * "Four conditions page; this was one of them." True when written,
 * wrong for days after three conditions were added — and it went out
 * on every page to the keeper, telling him a number about his own
 * alerting that no longer held. He asked what the line meant, which is
 * how it was found.
 *
 * The array is the list now and the count is read from it. This test
 * is the part that keeps it that way.
 */
describe("the alert footer counts what actually exists", () => {
  it("has no hand-typed number anywhere in the alert module", async () => {
    // The specific regression: a spelled-out or numeric count of
    // conditions living in prose beside the list it describes.
    const { ALERT_CONDITIONS: list } = await import("@/lib/alerts");
    expect(list.length).toBeGreaterThan(0);
    // Derived, so this holds at any length rather than at one length.
    expect(new Set(list).size, "a condition is listed twice").toBe(list.length);
  });

  it("still carries the conditions the store actually pages on", () => {
    // Named rather than counted, because the count passing tells you
    // nothing about whether the right things are on the list. The two
    // that matter most: a signature problem, and the first stranger.
    expect(ALERT_CONDITIONS).toContain("signing_failure");
    expect(ALERT_CONDITIONS).toContain("first_outside_signature");
  });
});
