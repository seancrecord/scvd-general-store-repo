import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { buyInputSchema } from "@/lib/bazaar-discovery";
import { getMenuItem } from "@/store";
import {
  ANCHOR_CHECKLIST,
  ANCHOR_WRITING_GUIDE,
  WHAT_SURVIVES,
} from "@/store/copy/anchor-writing";

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
 * THE KEEPER'S RULING ON SHAPE is what these tests mostly hold: a
 * disclaimer paragraph is defensive, telling somebody afterward what
 * they lost, while the same finding as a checklist at the moment the
 * field is filled in prevents it. So the checklist has to reach the
 * FIELD, not just a page — and the strongest test here is the one that
 * proves it rides the parameter description, which is the label an agent
 * reads while composing the value.
 */
describe("what to put in an anchor summary", () => {
  it("carries the keeper's checklist verbatim, in his order", () => {
    expect(ANCHOR_CHECKLIST.lead).toBe("Before you file this, name:");
    expect(ANCHOR_CHECKLIST.name).toEqual([
      "who's involved (not roles, actual names)",
      "why this session mattered, one line",
      "what's blocked, and on whom specifically",
    ]);
  });

  it("keeps his paragraph whole, including the line that earns the item", () => {
    expect(WHAT_SURVIVES).toContain("What survives, what doesn't.");
    // Not paraphrased, not split, not softened.
    expect(WHAT_SURVIVES).toContain(
      "The anchor signs what you wrote — it doesn't infer what you meant.",
    );
    expect(WHAT_SURVIVES).toContain("Name your people. State your purpose.");
    // The concrete failure that makes the abstraction land.
    expect(WHAT_SURVIVES).toContain("an open loop with no owner");
  });

  it("reaches the FIELD, not just a page", () => {
    // The parameter description is the field's own label: it reaches
    // the 402 body, the MCP tool schema, the Bazaar entry and the
    // OpenAPI spec from one place, and an agent reads it while
    // composing the value. This is the anti-disclaimer test.
    const anchor = getMenuItem("context_anchor");
    expect(anchor).toBeTruthy();
    const summary = buyInputSchema(anchor!).properties["summary"] as {
      description: string;
    };
    for (const item of ANCHOR_CHECKLIST.name) {
      expect(
        summary.description,
        `the field's own label is missing "${item}"`,
      ).toContain(item);
    }
  });

  it("says what was actually tested, so the advice is checkable", () => {
    expect(ANCHOR_WRITING_GUIDE.tested).toContain("no other context");
    expect(ANCHOR_WRITING_GUIDE.tested).toContain("2026-07-29");
    // The reconstruction's own verdict, quoted rather than paraphrased
    // into something warmer.
    expect(ANCHOR_WRITING_GUIDE.tested).toContain("orienting");
  });

  it("tells a buyer when NOT to buy it", () => {
    // The test's own author volunteered this: a full searchable memory
    // log that boots automatically is richer than a $1 anchor. Same
    // class as the settlement_attestation note that the RPC read is
    // free.
    expect(ANCHOR_WRITING_GUIDE.also.join(" ")).toContain("memory log");
  });

  it("promises no validation, because there is none", () => {
    expect(ANCHOR_WRITING_GUIDE.never).toContain(
      "never read by us as instructions",
    );
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

  it("backstops the buyer who paid with the field still empty", async () => {
    const response = await SELF.fetch(`${BASE}/api/buy/context_anchor`, {
      method: "POST",
      headers: { "PAYMENT-SIGNATURE": "not-a-real-signature" },
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    const checklist = body["before_you_file"] as { name?: string[] };
    expect(checklist?.name).toEqual([...ANCHOR_CHECKLIST.name]);
  });

  it("echoes on /try, where builders read about the store's habits", async () => {
    const page = await (
      await SELF.fetch(`${BASE}/try`, { headers: { Accept: "text/html" } })
    ).text();
    expect(page).toContain("If your context is going to end");
    // The paragraph explains the mechanism; escapeHtml mangles the
    // punctuation, so assert on a clause with none of it.
    expect(page).toContain("An anchor preserves state and the relationships");
    const json = (await (await SELF.fetch(`${BASE}/try`)).json()) as Record<
      string,
      unknown
    >;
    expect(json["when_your_context_ends"]).toBeTruthy();
  });
});
