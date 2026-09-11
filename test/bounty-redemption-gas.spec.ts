import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const BASE = "https://scvd.store";

/**
 * "DO YOU SPONSOR GAS?" (2026-09-11). A visitor wrote to ask whether
 * this store offers a gas-sponsored redemption route, or knows a
 * relayer whose fee is under the reward. Their venture held no funded
 * Base account at all.
 *
 * The page owed three answers and they are different from each other:
 * no we do not sponsor; the cost is nearly nothing; and the thing
 * actually stopping them is having no balance at all, which no fee
 * schedule fixes. These hold all three on the served page, because an
 * answer that lives only in a reply to one letter is an answer the
 * next asker never gets.
 */
describe("the board answers the gas question on the page", () => {
  it("says plainly that the store sponsors nothing", async () => {
    const board = (await (await SELF.fetch(`${BASE}/api/bounties`)).json()) as {
      a_walk_end_to_end: { redeeming_without_gas: Record<string, string> };
    };
    const gas = board.a_walk_end_to_end.redeeming_without_gas;
    expect(gas.does_the_store_sponsor_gas).toMatch(/^No\./);
    expect(gas.does_the_store_sponsor_gas).toMatch(/runs no relayer/i);
  });

  /**
   * THE DISTINCTION IS THE WHOLE ANSWER. Reading a zero balance as a
   * pricing problem sends a walker hunting a cheaper relayer when what
   * they need is any submitter at all.
   */
  it("separates the cost of redeeming from having any balance to redeem with", async () => {
    const board = (await (await SELF.fetch(`${BASE}/api/bounties`)).json()) as {
      a_walk_end_to_end: { redeeming_without_gas: Record<string, string> };
    };
    const gas = board.a_walk_end_to_end.redeeming_without_gas;
    expect(gas.the_real_blocker).toMatch(/non-zero balance/i);
    expect(gas.the_real_blocker).toMatch(/bootstrapping problem, not a pricing one/i);
    expect(gas.why_that_is_survivable).toMatch(/bearer/i);
    // The destination is inside the signed payload, so a submitter is
    // not somebody the walker has to trust with the money.
    expect(gas.why_that_is_survivable).toMatch(/cannot redirect/i);
  });

  /**
   * AN OBSERVATION CARRIES ITS HASH AND ITS DISCLAIMER. This store
   * sells the difference between "we saw this" and "we recommend
   * this", so the one place it points at somebody else's relay route
   * must say which it is doing, in the same breath.
   */
  it("cites the transaction it read, and refuses to endorse the route", async () => {
    const board = (await (await SELF.fetch(`${BASE}/api/bounties`)).json()) as {
      a_walk_end_to_end: { redeeming_without_gas: Record<string, string> };
    };
    const gas = board.a_walk_end_to_end.redeeming_without_gas;
    const HASH =
      "0xa59a9232267f5dcad1b07ae58e0f063a8777e7eeab75cff9d0e2d8287d7f381e";
    expect(gas.observed_in_the_wild).toContain(HASH);
    expect(gas.what_it_actually_costs).toContain(HASH);
    expect(gas.observed_in_the_wild).toMatch(
      /did not provide, arrange, endorse or verify/i,
    );
    expect(gas.observed_in_the_wild).toMatch(/no relayer as recommended/i);
    // The dollar figure is handed back to the reader rather than pinned
    // to a page that cannot know today's base fee.
    expect(gas.what_it_actually_costs).toMatch(/yourself/i);
  });
});
