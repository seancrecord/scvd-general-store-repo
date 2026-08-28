import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { storeGuideText } from "@/routes/llms";
import { STOCK_CLIENT_RAIL_NOTE } from "@/store/copy/rails";

const BASE = "https://scvd.store";

/**
 * "YOUR WALLET'S CHOICE OF RAIL" WAS NOT THE BUYER'S CHOICE
 * (task #89; SILENT_DEFAULTS row 13, verified 2026-08-28).
 *
 * This store offers three rails in every 402 — Base, Polygon, Solana
 * — and said so in a way that credited the buyer with picking among
 * them. A stock client does not pick. Read in the installed package:
 *
 *   - `applySpendControls` filters the accepts, then
 *     `paymentRequirementsSelector` takes `accepts[0]`
 *     (@x402/core client). We put Base first deliberately, so a
 *     blindly-signing client stays on Base — which is the same fact
 *     from the other side.
 *   - `wrapFetchWithPayment` (@x402/fetch) builds ONE payload, sends
 *     it, and retries only if a hook returns `recovered`. There is no
 *     loop over the remaining accepts. If the chosen rail fails, the
 *     other two are never tried.
 *
 * So for the default buyer the rail is not a choice and not a
 * fallback: it is Base, or nothing. The sentence was wider than what
 * the buyer actually gets, published by us, and flattering to us —
 * the same family as the signed-offers claim narrowed in #73, and the
 * reason rule 56 exists.
 *
 * WHAT IS STILL TRUE, and worth keeping: the rails ARE all offered,
 * with the same tiers, and a hand-rolling or configured client really
 * can take any of them. The fix is not to stop offering three rails.
 * It is to stop implying that an unconfigured client walks them.
 */

/** The retired phrasing. A claim that lost its check is withdrawn. */
const RETIRED = "your wallet's choice";

async function surfaces(): Promise<{ name: string; text: string }[]> {
  const skill = await (await SELF.fetch(`${BASE}/skill.md`)).text();
  return [
    { name: "/llms-full.txt", text: storeGuideText(BASE) },
    { name: "/skill.md", text: skill },
  ];
}

describe("the store stops crediting the buyer with a choice the client makes", () => {
  it("has retired the bare rail-choice phrasing everywhere", () => {
    /*
     * A SWEEP, NOT A SAMPLE. The phrase lived in two files and it
     * would have been easy to fix one; the whole shape of a stale
     * claim is that it outlives the place you remember it being.
     */
    const modules = import.meta.glob("/src/**/*.ts", {
      query: "?raw",
      import: "default",
      eager: true,
    }) as Record<string, string>;
    /*
     * THE RETIREMENT RECORD IS NOT AN OFFENDER, and this exclusion is
     * load-bearing rather than a convenience. copy/rails.ts quotes the
     * old sentence verbatim to say what was withdrawn and why; a sweep
     * that flagged it would push the next person to delete the only
     * place the retired words are written down, which is how a
     * correction quietly stops being findable. Same reasoning as the
     * pulse correction note that legitimately names the field it
     * retired: scan what is PUBLISHED, keep what is RECORDED.
     */
    const RETIREMENT_RECORD = "/src/store/copy/rails.ts";
    const offenders = Object.entries(modules)
      .filter(([path]) => path !== RETIREMENT_RECORD)
      .filter(([, source]) => source.includes(RETIRED))
      .map(([path]) => path);
    expect(
      offenders,
      `still telling buyers the rail is their wallet's choice: ${offenders.join(", ")} — a stock client takes accepts[0] and never walks the rest`,
    ).toEqual([]);

    // And the record itself must KEEP the retired words, or the
    // withdrawal becomes unfindable the moment someone tidies it.
    expect(
      (modules[RETIREMENT_RECORD] ?? "").includes(RETIRED),
      "the retirement record no longer quotes what it retired — the correction is now unsearchable",
    ).toBe(true);
  });

  it("says plainly what a stock client actually does with three rails", async () => {
    /*
     * ONE SENTENCE, ASSERTED VERBATIM, and the reason is a false pass
     * this very test produced on its first run. It began as a regex
     * over the served prose — /takes the first|does not try|.../ — and
     * the guide PASSED because an unrelated line about reading order
     * said "a reader takes the first path". A pattern loose enough to
     * match the claim is loose enough to match anything, so the claim
     * became a constant and this compares against the constant.
     */
    const note = STOCK_CLIENT_RAIL_NOTE.replace(/\s+/g, " ");
    for (const { name, text } of await surfaces()) {
      expect(
        text.replace(/\s+/g, " "),
        `${name} offers three rails without saying that a stock client takes the first and never tries the others`,
      ).toContain(note);
    }
  }, 20_000);

  it("still offers all three rails, because that part was never the problem", async () => {
    for (const { name, text } of await surfaces()) {
      expect(text, `${name} lost a rail`).toContain("eip155:8453");
      expect(text, `${name} lost Solana`).toMatch(/solana:/i);
    }
    expect(storeGuideText(BASE)).toContain("eip155:137");
  }, 20_000);
});
