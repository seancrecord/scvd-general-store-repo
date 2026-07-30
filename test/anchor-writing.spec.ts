import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { ANCHOR_WRITING_GUIDE } from "@/store/copy/anchor-writing";

const BASE = "https://scvd.store";

/**
 * THE ANCHOR, TESTED COLD — and the guidance that came out of it.
 *
 * 2026-07-29: a partner agent filed a real anchor. 2026-07-30: he handed
 * the bare URL to a sub-agent with no other context and compared its
 * reconstruction against his own memory log. It recovered all five open
 * threads with the right specifics. It did not recover why the session
 * happened, could not resolve an in-house role word (it read as an
 * unidentifiable proper name), and had no URLs to check anything with.
 *
 * All three misses are properties of the WRITING, so they become
 * guidance for the next buyer. These tests hold the guidance to the
 * shape of the evidence: it says what was tested, it names the three
 * misses, it states the boundary rather than overclaiming, and it
 * promises nothing is enforced — because nothing is.
 */
describe("what to put in an anchor summary", () => {
  it("names all three things the cold read could not recover", async () => {
    const advice = ANCHOR_WRITING_GUIDE.do.join(" ").toLowerCase();
    // 1. Purpose above the loops.
    expect(advice).toContain("why the session happened");
    // 2. Names a stranger can resolve.
    expect(advice).toContain("stranger can resolve");
    // 3. Links, or nothing is checkable.
    expect(advice).toContain("url");
  });

  it("says what was actually tested, so the advice is checkable", () => {
    expect(ANCHOR_WRITING_GUIDE.tested).toContain("no other context");
    expect(ANCHOR_WRITING_GUIDE.tested).toContain("2026-07-29");
    // The reconstruction's own verdict, quoted rather than paraphrased
    // into something warmer.
    expect(ANCHOR_WRITING_GUIDE.tested).toContain("orienting");
  });

  it("states the boundary instead of stretching one pass into a claim", () => {
    const boundary = ANCHOR_WRITING_GUIDE.honest_boundary.toLowerCase();
    expect(boundary).toContain("not a substitute");
    expect(boundary).toContain("what was open");
    // And the guidance tells a buyer when NOT to buy it, which is the
    // finding the test's own author volunteered: a full searchable
    // memory log that boots automatically is richer than this.
    expect(ANCHOR_WRITING_GUIDE.do.join(" ")).toContain("memory log");
  });

  it("promises no validation, because there is none", () => {
    expect(ANCHOR_WRITING_GUIDE.never).toContain("never read by us as instructions");
    expect(ANCHOR_WRITING_GUIDE.never.toLowerCase()).toContain(
      "none of the above is enforced",
    );
  });

  it("rides the listing a buyer reads before paying", async () => {
    const body = (await (
      await SELF.fetch(`${BASE}/menu/context_anchor`)
    ).json()) as Record<string, unknown>;
    expect(body["writing_the_summary"]).toBeTruthy();
  });

  it("does not clutter every other listing with it", async () => {
    const body = (await (
      await SELF.fetch(`${BASE}/menu/hello`)
    ).json()) as Record<string, unknown>;
    expect(Object.hasOwn(body, "writing_the_summary")).toBe(false);
  });

  it("reaches the buyer at the moment they left the field empty", async () => {
    const response = await SELF.fetch(`${BASE}/api/buy/context_anchor`, {
      method: "POST",
      headers: { "PAYMENT-SIGNATURE": "not-a-real-signature" },
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    const guidance = String(body["writing_the_summary"] ?? "");
    // The composing moment is the one that matters; a listing read
    // happened minutes ago and a 402 body is already long.
    expect(guidance.toLowerCase()).toContain("why the session happened");
    expect(guidance).toContain("cold reader");
  });
});
