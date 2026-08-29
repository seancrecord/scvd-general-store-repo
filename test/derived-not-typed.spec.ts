import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import SKILL_BUNDLE from "../registry/clawhub/SKILL.md?raw";
import { MENU_ITEMS } from "@/store";

const BASE = "https://scvd.store";

/**
 * DERIVED, NOT TYPED — the standing guard for the defect that bit three
 * times in one week and would have kept biting.
 *
 *   2026-07-28  the published skill bundle claimed "twenty-one items"
 *               against a shelf of twenty-three.
 *   2026-07-30  llms.txt said the corrections record held "five of
 *               them" against six.
 *   2026-07-30  the storefront's six shelves carried hand-typed prices
 *               beside the names, all still correct by luck.
 *
 * Every one was caught by a person noticing, which is not a mechanism.
 * The keeper's instruction after the third: derive them or harmonize
 * them somehow, rather than keep finding them. So this file walks the
 * SERVED surfaces — what a buyer or a crawler actually receives — and
 * fails the build on the two shapes that can silently go stale.
 *
 * WHY SERVED SURFACES AND NOT THE SOURCE: a stale count in a code
 * comment is untidy. A stale count in a response is a false statement
 * to somebody who is deciding whether to trust us, which is the only
 * kind this store treats as a correction. Comments are deliberately out
 * of scope; do not "fix" this by widening it to the source tree.
 */

/** Everything a stranger can read without paying or authenticating. */
const PUBLIC_SURFACES = [
  "/",
  "/llms.txt",
  "/skill.md",
  "/menu.json",
  "/what",
  "/try",
  "/neighbours",
  "/stack",
  "/corrections",
  "/visitors",
  "/trust-list.json",
  "/house-ledger.json",
  "/.well-known/x402.json",
  /*
   * ADDED 2026-08-29, and the reason is worth keeping: the discovery
   * document failed this guard on a phrase that reached it from the
   * dataset roster, while /atlas.json carried the SAME phrase and
   * passed — because it was not on this list. A guard that covers
   * every public surface except the ones added since it was written
   * covers the past, which is the half that cannot change.
   *
   * The tallies and the atlas are all machine surfaces a stranger
   * reads without paying, which is exactly this list's own
   * definition.
   */
  "/atlas.json",
  "/registry",
  "/inflows",
  "/agents.md",
] as const;

/**
 * A spelled-out number in front of a countable noun. The nouns are the
 * things this store actually counts and has actually got wrong; the
 * point is not to ban English, it is to ban a tally that no code
 * recomputes.
 */
const TYPED_COUNT =
  /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|twenty[- ]\w+|thirty|forty|fifty)\s+(of them|items|goods|shelves|corrections|entries|tools|wallets|dependencies|neighbours|receipts|patrons|certificates|signatures)\b/gi;

async function fetchText(path: string): Promise<string> {
  const response = await SELF.fetch(`${BASE}${path}`, {
    headers: { Accept: path.includes(".") ? "*/*" : "text/html" },
  });
  return response.text();
}

describe("nothing served carries a tally nobody recomputes", () => {
  it("holds across every public surface", async () => {
    const offences: string[] = [];
    for (const path of PUBLIC_SURFACES) {
      const body = await fetchText(path);
      for (const match of body.matchAll(TYPED_COUNT)) {
        offences.push(`${path}: "${match[0]}"`);
      }
    }
    expect(
      offences,
      `a count is typed rather than derived — that is a lie with a timer on it:\n${offences.join("\n")}`,
    ).toEqual([]);
  });

  it("holds in the published skill bundle, which is not served by us", async () => {
    // The bundle lives on a registry and drifts out of sight, which is
    // exactly how it carried a wrong item count for two days. Walked
    // here because nothing else walks it.
    const offences = [...SKILL_BUNDLE.matchAll(TYPED_COUNT)].map((m) => m[0]);
    expect(offences, `registry/clawhub/SKILL.md carries typed counts`).toEqual(
      [],
    );
  });
});

describe("no surface quotes a price the menu does not charge", () => {
  /**
   * The storefront defect generalised. An item's name and a dollar
   * amount sitting near each other in prose is how a price gets typed;
   * this finds those pairs on every public surface and checks them
   * against the menu.
   */
  it("checks every item name that appears beside a number", async () => {
    const wrong: string[] = [];
    for (const path of PUBLIC_SURFACES) {
      const body = await fetchText(path);
      for (const item of MENU_ITEMS) {
        // Look for the item's display name followed closely by a price.
        const near = new RegExp(
          `${item.name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}[^$\\n]{0,80}\\$([0-9]+(?:\\.[0-9]{1,3})?)`,
          "gi",
        );
        for (const match of body.matchAll(near)) {
          const quoted = Number.parseFloat(match[1] ?? "");
          if (Number.isFinite(quoted) && quoted !== item.price_usdc) {
            wrong.push(
              `${path}: "${item.name}" quoted at $${quoted}, menu says $${item.price_usdc}`,
            );
          }
        }
      }
    }
    expect(wrong, `a price is typed rather than derived:\n${wrong.join("\n")}`).toEqual(
      [],
    );
  });
});
