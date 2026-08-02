import { describe, expect, it } from "vitest";
import { SELF } from "cloudflare:test";
import {
  IDEMPOTENCY_TTL_SECONDS,
  SUGGESTED_KEY_BUCKET_SECONDS,
} from "@/lib/idempotency";

/**
 * THE DOUBLE-CHARGE GUARD IS ONLY A FEATURE IF SOMEBODY IS TOLD ABOUT
 * IT BEFORE THEY PAY.
 *
 * The mechanism shipped, the 402 body carries it, and the two
 * documents an agent actually reads BEFORE its first purchase — the
 * live /skill.md and the bundle published to ClawHub — said nothing.
 * A buyer that reads the skill, writes a retry loop, and meets the
 * mechanism for the first time in a 402 it has already parsed past is
 * a buyer the mechanism did not reach.
 *
 * The two documents are maintained separately (the live one is
 * generated, the bundle is hand-kept), so the claim is asserted in
 * both places rather than in whichever one was edited last.
 *
 * AND THE NUMBERS ARE DERIVED, not read (AT_SCALE rule 1). The copy
 * says "inside the same minute" for the suggested key and "24 hours"
 * for a key of your own. Both are facts about constants in
 * lib/idempotency.ts. If either constant moves, the sentence becomes
 * a lie told to somebody about their own wallet, so the test fails on
 * the constant rather than waiting for a reader to notice.
 */
async function liveSkill(): Promise<string> {
  const res = await SELF.fetch("https://scvd.store/skill.md");
  expect(res.status).toBe(200);
  return res.text();
}

async function bundle(): Promise<string> {
  return (await import("../registry/clawhub/SKILL.md?raw")).default;
}

describe("both pre-purchase documents name the double-charge guard", () => {
  it("names the HTTP header an agent has to send", async () => {
    for (const doc of [await liveSkill(), await bundle()]) {
      expect(doc).toContain("Idempotency-Key");
      expect(doc).toContain("suggested_key");
    }
  });

  it("names the MCP-side key too, since half the buyers arrive that way", async () => {
    for (const doc of [await liveSkill(), await bundle()]) {
      expect(doc).toContain("x402/idempotency-key");
    }
  });

  it("says the mechanism cannot refuse a purchase", async () => {
    // The one thing a buyer needs to believe before adopting it: an
    // idempotency key is a safety net, never a gate. A doc that
    // describes the guard without this reads like a new way to fail.
    for (const doc of [await liveSkill(), await bundle()]) {
      expect(doc.toLowerCase()).toContain("refuse a purchase");
    }
  });

  it("says the suggested key is public, because it is", async () => {
    for (const doc of [await liveSkill(), await bundle()]) {
      expect(doc).toContain("anyone can compute it");
      expect(doc).toContain("VERIFIED paying wallet");
    }
  });

  /**
   * The window words, checked against the constants that set them.
   * Written as a lookup rather than a hard-coded "minute"/"24 hours"
   * so that a changed constant fails HERE with the reason attached,
   * instead of silently leaving prose that contradicts the code.
   */
  it("describes windows that match the constants", async () => {
    const suggestedWord =
      SUGGESTED_KEY_BUCKET_SECONDS === 60
        ? "minute"
        : `${SUGGESTED_KEY_BUCKET_SECONDS} seconds`;
    const ownWord =
      IDEMPOTENCY_TTL_SECONDS === 24 * 3600
        ? "24 hours"
        : `${IDEMPOTENCY_TTL_SECONDS} seconds`;
    for (const doc of [await liveSkill(), await bundle()]) {
      expect(
        doc,
        `the suggested-key window in lib/idempotency.ts is ${SUGGESTED_KEY_BUCKET_SECONDS}s; the copy must say so`,
      ).toContain(suggestedWord);
      expect(
        doc,
        `the bring-your-own-key window is ${IDEMPOTENCY_TTL_SECONDS}s; the copy must say so`,
      ).toContain(ownWord);
    }
  });
});
