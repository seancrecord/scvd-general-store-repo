import { describe, expect, it } from "vitest";
import { MENU_ITEMS } from "@/store";
import { FIELD_SPEND_CAP_USD } from "@/services/launch-check";

/**
 * LEDGER I7 — THE ECONOMIC INVARIANT WAS HAND-TYPED IN TWO FILES.
 *
 * The launch check takes money at the till and spends money in the
 * field. Those are two different numbers in two different files: the
 * item's price in the menu, and FIELD_SPEND_CAP_USD in the service.
 * Nothing checked that the first exceeds the second, so a routine
 * price edit — or a cap raised for a legitimate reason — could quietly
 * invert the trade and make every sale a loss. AT_SCALE rule 1: a
 * number that matters and is typed twice is an invariant with no
 * guard.
 *
 * The margin is deliberate rather than `>`. Equal is not safe, and
 * "slightly more" is not a business — the walk also costs a
 * facilitator fee and gas. Requiring a wide multiple means the guard
 * fails while there is still room to think, instead of at the moment
 * the store starts losing money on every check.
 *
 * WHAT THIS CANNOT DO, said plainly because the ledger asked for it:
 * this is a PER-CHECK bound. Nothing here caps aggregate field spend
 * across many checks in a day — that is bounded only by sales volume,
 * and the final ceiling is whatever the field wallet actually holds.
 * A daily aggregate cap that fails closed is the missing half.
 */

/** The trade has to stay lopsided by this much, not merely positive. */
const MIN_RATIO = 50;

describe("the till takes more than the field can spend", () => {
  it("prices the launch check far above its own payout cap", () => {
    const item = MENU_ITEMS.find((entry) => entry.id === "launch_check");
    expect(item).toBeDefined();

    const price = item!.price_usdc;
    expect(price).toBeGreaterThan(FIELD_SPEND_CAP_USD);
    // The load-bearing ratio, derived from both live numbers rather
    // than restated as a third copy of either.
    expect(price / FIELD_SPEND_CAP_USD).toBeGreaterThanOrEqual(MIN_RATIO);
  });

  it("holds for every item that can spend from the field wallet", () => {
    /*
     * Today the launch check is the only one. Written as a sweep so
     * that a second field-spending item cannot ship without either
     * satisfying the invariant or failing here by name — which is the
     * difference between a guard and a note about one item.
     */
    const fieldSpenders = MENU_ITEMS.filter((entry) =>
      /launch_check|field/.test(entry.id),
    );
    expect(fieldSpenders.length).toBeGreaterThan(0);
    for (const item of fieldSpenders) {
      expect(item.price_usdc / FIELD_SPEND_CAP_USD).toBeGreaterThanOrEqual(
        MIN_RATIO,
      );
    }
  });
});
