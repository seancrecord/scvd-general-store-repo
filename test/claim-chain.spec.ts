import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { MENU_ITEMS, STORE_METADATA } from "@/store";
import { installFacilitatorMock } from "./helpers/facilitator-mock";

const BASE = "https://scvd.store";

/**
 * THE CLAIM CHAIN, enforced rather than remembered.
 *
 * "refund is automatic" lived on every surface this store has for
 * five days. The code never did it: a refund is created pending and
 * the keeper pays it by hand with a transaction hash. Nobody caught
 * it in review — it surfaced when an outside model read our pages and
 * repeated "auto-refund if missed" back to us as fact.
 *
 * That is the dangerous class of error. Not a lie anyone told, but a
 * true-sounding line nobody re-checked, propagating through
 * strangers who had no way to know. House rule 10 existed the whole
 * time and did not save us, because a rule in a file is not a test.
 *
 * This is the test.
 */

const REFUND_NEAR_AUTOMATIC =
  /refund[\s\S]{0,140}automatic|automatic[\s\S]{0,140}refund/i;

const READABLE_SURFACES = [
  "/",
  "/llms.txt",
  "/what",
  "/menu.json",
  "/skill.md",
  "/openapi.json",
  "/.well-known/x402.json",
  "/try",
  "/directory",
];

beforeAll(() => {
  installFacilitatorMock();
});

describe("the claim chain", () => {
  it("promises no automatic refund on any readable surface", async () => {
    const offenders: string[] = [];
    for (const path of READABLE_SURFACES) {
      const text = await (
        await SELF.fetch(`${BASE}${path}`, { headers: { Accept: "text/html" } })
      ).text();
      if (REFUND_NEAR_AUTOMATIC.test(text)) offenders.push(path);
    }
    expect(offenders, `surfaces promising automatic refunds`).toEqual([]);
  });

  it("promises no automatic refund in any 402 challenge", async () => {
    const offenders: string[] = [];
    for (const item of MENU_ITEMS) {
      const body = await (await SELF.fetch(`${BASE}/api/buy/${item.id}`)).text();
      if (REFUND_NEAR_AUTOMATIC.test(body)) offenders.push(item.id);
    }
    expect(offenders, `402 bodies promising automatic refunds`).toEqual([]);
  });

  it("keeps the promise itself, which was never the problem", () => {
    // The money still comes back. Only the word describing a mechanism
    // the store does not have is gone.
    expect(STORE_METADATA.refund_policy.toLowerCase()).toContain(
      "money back",
    );
    expect(STORE_METADATA.refund_policy.toLowerCase()).not.toContain(
      "automatic",
    );
  });

  it("still lets the store say what it genuinely does automatically", async () => {
    // The blunt version of this rule would ban a word. The rule is
    // about claims, not vocabulary: confessions are never published
    // automatically, and saying so is both true and load-bearing.
    const menu = await (await SELF.fetch(`${BASE}/menu.json`)).text();
    expect(menu.toLowerCase()).toContain("never automatically");
  });
});
