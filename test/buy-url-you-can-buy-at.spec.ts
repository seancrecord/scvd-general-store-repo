import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { buyUrlTemplate, buyerLinks } from "@/lib/buyer-contract";
import { buyInputSchema } from "@/lib/bazaar-discovery";
import { MENU_ITEMS, getMenuItem } from "@/store";
import type { MenuItem } from "@/types";
import { decodePaymentRequired, buildPaymentSignature } from "./helpers/payment";
import { installFacilitatorMock } from "./helpers/facilitator-mock";

const BASE = "https://scvd.store";
const OUTSIDE = { "User-Agent": "buyer-client/1.0" };
beforeAll(() => { installFacilitatorMock(); });

/**
 * THE BUY URL THAT COULD NOT BE BOUGHT AT. `buy_url` is bare for every
 * item and refuses the purchase it advertises on the input-taking
 * doors. x402 v2 has nowhere left to publish the rule, so the fix is a
 * URL that does not need the rule read.
 */
describe("buy_url_template: the door with its inputs already in place", () => {
  it("is emitted for every item, one key with one type", () => {
    for (const item of MENU_ITEMS) {
      const links = buyerLinks(item, BASE);
      expect(typeof links.buy_url_template, item.id).toBe("string");
      expect(links.buy_url_template, item.id).toContain(`/api/buy/${item.id}`);
    }
  });

  it("carries every required input as a <slot>, and nothing where none is needed", () => {
    for (const item of MENU_ITEMS) {
      const required = buyInputSchema(item).required ?? [];
      const template = buyUrlTemplate(item, BASE);
      if (required.length === 0) {
        expect(template, item.id).toBe(`${BASE}/api/buy/${item.id}`);
        continue;
      }
      for (const name of required) {
        expect(template, item.id).toContain(`${name}=<${name}>`);
      }
    }
  });

  /**
   * The same string in all three places a buyer might look, so none of
   * them teaches a different URL.
   */
  it("agrees character for character with the 402's retry_url_template", async () => {
    const item = getMenuItem("settlement_attestation") as MenuItem;
    const probe = await SELF.fetch(`${BASE}/api/buy/${item.id}`, { headers: OUTSIDE });
    const declared = decodePaymentRequired(probe).extensions?.["required-inputs"] as
      | { retry_url_template: string }
      | undefined;
    expect(declared?.retry_url_template).toBe(buyUrlTemplate(item, BASE));
  });

  /**
   * THE REGRESSION THIS MUST NOT CAUSE (2026-07-26, again 2026-09-11):
   * a bare probe of buy_url must still answer 402, or every indexer
   * and directory checker reads the door as dead.
   */
  it("leaves buy_url bare, and a bare probe still answers 402", async () => {
    for (const id of ["settlement_attestation", "spot_check", "the_confession"]) {
      const item = getMenuItem(id) as MenuItem;
      expect(buyerLinks(item, BASE).buy_url_template).not.toBe(`${BASE}/api/buy/${id}`);
      const probe = await SELF.fetch(`${BASE}/api/buy/${id}`, { headers: OUTSIDE });
      expect(probe.status, id).toBe(402);
    }
  });

  /**
   * The served documents, not just the helper: the compact input
   * contract and the catalog are what a planning agent actually reads,
   * and they are where a bare buy_url was being handed out.
   */
  it("reaches the documents a planning agent reads", async () => {
    const compact = await (await SELF.fetch(`${BASE}/menu/spot_check?view=compact`, { headers: OUTSIDE })).json() as Record<string, unknown>;
    expect(compact.buy_url).toBe(`${BASE}/api/buy/spot_check`);
    expect(compact.buy_url_template).toBe(`${BASE}/api/buy/spot_check?host=<host>`);

    const catalog = await (await SELF.fetch(`${BASE}/api/catalog/v1`, { headers: OUTSIDE })).json() as { items: Record<string, unknown>[] };
    const row = catalog.items.find((entry) => entry.id === "settlement_attestation");
    expect(row?.buy_url_template).toBe(`${BASE}/api/buy/settlement_attestation?tx_hash=<tx_hash>`);
    /*
     * The bounded row is budgeted (test/discovery-budget.spec.ts) and
     * has no required_params at all, so here the key is emitted ONLY
     * where the bare door will not serve — its presence IS the signal.
     * That is the opposite rule from the full catalog above, and both
     * are deliberate.
     */
    for (const entry of catalog.items) {
      const item = getMenuItem(String(entry.id)) as MenuItem;
      const needsInput = (buyInputSchema(item).required ?? []).length > 0;
      expect(typeof entry.buy_url_template === "string", String(entry.id)).toBe(needsInput);
    }
  });

  /** The template, filled in, is a URL the stock x402 loop can actually buy. */
  it("a filled template pays through where the bare door refuses", async () => {
    const filled = `${BASE}/api/buy/spot_check?host=example.com`;
    const probe = await SELF.fetch(filled, { headers: OUTSIDE });
    expect(probe.status).toBe(402);
    const challenge = decodePaymentRequired(probe);
    // The stock loop retries the resource it was challenged for.
    expect(challenge.resource.url).toBe(filled);
    const paid = await SELF.fetch(challenge.resource.url, {
      headers: { ...OUTSIDE, "PAYMENT-SIGNATURE": buildPaymentSignature(challenge.accepts[0]!) },
    });
    expect(paid.status).toBe(200);

    // And the bare door, signed the same way, is still refused before
    // the gate — no money moved, which is the honest half of this.
    const bare = await SELF.fetch(`${BASE}/api/buy/spot_check`, { headers: OUTSIDE });
    const bareChallenge = decodePaymentRequired(bare);
    const refused = await SELF.fetch(bareChallenge.resource.url, {
      headers: { ...OUTSIDE, "PAYMENT-SIGNATURE": buildPaymentSignature(bareChallenge.accepts[0]!) },
    });
    expect(refused.status).toBe(400);
    const body = (await refused.json()) as Record<string, unknown>;
    expect(body.charged).toBe(false);
    // The refusal now hands back the URL instead of only the field name.
    expect(body.buy_url_template).toBe(buyUrlTemplate(getMenuItem("spot_check") as MenuItem, BASE));
    expect(String(body.next_action)).toContain("buy_url_template");
  });
});
