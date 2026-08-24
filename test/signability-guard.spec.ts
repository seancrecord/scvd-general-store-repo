import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { decodePaymentRequired } from "./helpers/payment";
import { MENU_ITEMS } from "@/store/menu";
import { HAND_ROLLING } from "@/store/hand-rolling";

const BASE = "https://scvd.store";

// Without the mock the SDK validates our offered networks against a
// facilitator that is not there, and route construction fails before
// any challenge exists to inspect.
beforeAll(() => {
  installFacilitatorMock();
});

/**
 * SIGNABILITY, FORCED TO STAY TRUE (2026-08-24).
 *
 * x402-list's eip712_domain_extra check decides whether we appear in
 * `?signable=true` results — and unknowns are EXCLUDED, so losing the
 * field is a silent distribution loss, not a visible failure. We
 * confirmed by hand that every live EVM entry carries extra.name and
 * extra.version (roadmap 0.15). But the values are emitted by the
 * x402 SDK, not by railAccepts — our own code never sets them — and
 * dependabot bumps that SDK regularly. A version that dropped or
 * renamed the field would have passed every test in this suite while
 * quietly removing us from every signability-filtered index.
 *
 * So this spec walks EVERY priced door on the menu, derived from
 * MENU_ITEMS rather than typed (AT_SCALE rule 1), and fails the
 * suite the day any EVM entry loses its EIP-712 domain extra. The
 * expected values come from HAND_ROLLING.eip712 — the same constants
 * the store publishes to hand-rollers — because a guard asserting a
 * retyped "USD Coin" would be one more copy that can drift.
 */
describe("every priced door's 402 stays signable", () => {
  it("every EVM accepts entry carries the EIP-712 domain extra, on every menu door", async () => {
    const pricedItems = MENU_ITEMS.filter((item) => item.price_usdc > 0);
    expect(pricedItems.length).toBeGreaterThan(0);
    const inspected: string[] = [];

    for (const item of pricedItems) {
      const response = await SELF.fetch(`${BASE}/api/buy/${item.id}`);
      // 503 is a door honestly not selling right now — the shuttered
      // human-labor shelf, the capacity bench, a launch check with no
      // field wallet in this deployment. Those issue no envelope to
      // inspect. Anything else is a broken door and fails here.
      if (response.status === 503) {
        continue;
      }
      expect(
        response.status,
        `${item.id}: an unpaid knock on a priced door answers 402 (or an honest 503)`,
      ).toBe(402);
      inspected.push(item.id);
      const challenge = decodePaymentRequired(response);
      expect(
        challenge.x402Version,
        `${item.id}: the challenge speaks x402 v2`,
      ).toBe(2);

      const evmEntries = challenge.accepts.filter((entry) =>
        entry.network.startsWith("eip155:"),
      );
      expect(
        evmEntries.length,
        `${item.id}: at least one EVM rail is offered`,
      ).toBeGreaterThan(0);

      for (const entry of evmEntries) {
        const extra = entry.extra as
          | { name?: unknown; version?: unknown }
          | undefined;
        expect(
          extra,
          `${item.id} (${entry.network}): the entry carries an extra object — without it a client cannot build the EIP-712 domain, and x402-list's signability check reads unknown, which ?signable=true EXCLUDES`,
        ).toBeDefined();
        if (entry.network === HAND_ROLLING.eip712.chain) {
          // Base mainnet's exact values are load-bearing: the domain
          // trap documented in hand-rolling.ts means a wrong name is
          // as unsignable as a missing one.
          expect(extra?.name, `${item.id}: Base extra.name`).toBe(
            HAND_ROLLING.eip712.name,
          );
          expect(extra?.version, `${item.id}: Base extra.version`).toBe(
            HAND_ROLLING.eip712.version,
          );
        } else {
          // Other EVM rails (Polygon is flag-gated and absent in this
          // pool) must still carry non-empty values; their exact
          // domain names belong to their own USDC deployments.
          expect(
            typeof extra?.name === "string" && extra.name.length > 0,
            `${item.id} (${entry.network}): extra.name is a non-empty string`,
          ).toBe(true);
          expect(
            typeof extra?.version === "string" && extra.version.length > 0,
            `${item.id} (${entry.network}): extra.version is a non-empty string`,
          ).toBe(true);
        }
      }
    }

    // The guard is only worth having if it actually inspected the
    // shelf. A menu where most priced doors stopped issuing 402s is
    // a different, louder failure than a signability drift — but it
    // must be a failure here too, or a routing regression turns this
    // whole spec into a vacuous pass.
    expect(
      inspected.length,
      "most priced doors issued an envelope to inspect",
    ).toBeGreaterThan(pricedItems.length / 2);
  });
});
