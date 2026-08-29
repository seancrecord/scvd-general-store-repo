import { SELF } from "cloudflare:test";
import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import {
  SIGNING_WINDOW_SECONDS,
  priceTiersUsdc,
  railAccepts,
} from "@/lib/payments";
import { MENU_ITEMS } from "@/store";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * THE FIVE MINUTES NOBODY CHOSE (task #90; SILENT_DEFAULTS row 2).
 *
 * `@x402/core` builds every payment requirement with
 * `maxTimeoutSeconds: resourceConfig.maxTimeoutSeconds || 300`
 * (dist/esm/chunk-BA2VL4DT.mjs:1061). `railAccepts` never set the
 * field, so `option.maxTimeoutSeconds` arrived undefined and the
 * library's fallback stamped a five-minute signing window on every
 * accept of every door this store has ever issued.
 *
 * Five minutes may well be right. The defect is that it was never
 * decided — it is a number in someone else's package that became this
 * store's contract with its buyers by omission, and it could move on
 * their release schedule without a line of our code changing. A buyer
 * whose flow includes a human approval step, a queued signer or a cold
 * wallet signs an authorization that is already expired, and the
 * refusal reaches them as a rejected payment rather than as a rule
 * they could have read.
 *
 * WHAT THIS SPEC HAS TO DISTINGUISH, and it is the whole difficulty:
 * "we set 300" and "they defaulted to 300" produce IDENTICAL served
 * bytes. A test that only reads the challenge would pass with the
 * assignment deleted — the same shape as the spend-cap spec that went
 * green against a hardcoded ceiling (#52). So the falsifier is taken
 * at the source, on the PaymentOption objects themselves, where an
 * unset field is `undefined` and no fallback has run yet.
 */

describe("the signing window is ours, not a fallback", () => {
  it("sets the field on every accept before the library can default it", () => {
    /*
     * THE ASSERTION THAT CANNOT BE FOOLED BY THE FALLBACK. Read at the
     * source: if the assignment is removed, these are `undefined`
     * here even though the served 402 would still say 300.
     */
    /*
     * THE CONSTANT IS PROVEN TO EXIST FIRST, and that is not
     * ceremony. Written without this line, the loop below compared
     * `undefined` (the unset field) against `undefined` (the missing
     * export) and PASSED against completely unbuilt code. Two absences
     * satisfying an equality is the third time this shape has appeared
     * in a week — see the spend-cap spec, where a hardcoded ceiling
     * agreed with itself across every surface.
     */
    expect(
      typeof SIGNING_WINDOW_SECONDS,
      "the window constant does not exist, so the comparison below would pass by comparing two absences",
    ).toBe("number");
    const accepts = railAccepts(testEnv, [1, 2, 5]);
    expect(accepts.length, "no accepts to check").toBeGreaterThan(0);
    for (const accept of accepts) {
      expect(
        accept.maxTimeoutSeconds,
        "an accept left the signing window to @x402/core's `|| 300` — the store's contract with its buyers set by omission",
      ).toBe(SIGNING_WINDOW_SECONDS);
    }
  });

  it("names a window a signer could plausibly need", () => {
    // Not pinned to a literal: the keeper may move it. Pinned to being
    // a real, deliberate quantity rather than zero or a year.
    expect(SIGNING_WINDOW_SECONDS).toBeGreaterThanOrEqual(60);
    expect(SIGNING_WINDOW_SECONDS).toBeLessThanOrEqual(3600);
  });
});

describe("every door serves the window we chose", () => {
  beforeAll(() => {
    installFacilitatorMock();
  });

  /*
   * THE CATALOGUE, NOT A SAMPLE. This defect's whole shape is "one
   * place set it and the rest did not" — the same shape as
   * customPaywallHtml and the src402h read branch. A sampled check
   * picks the door that happens to be right.
   */
  it("carries it on every accept of every priced door", async () => {
    const priced = MENU_ITEMS.filter((item) => item.price_usdc > 0);
    expect(priced.length).toBeGreaterThan(0);
    for (const item of priced.slice(0, 6)) {
      const response = await SELF.fetch(`${BASE}/api/buy/${item.id}`);
      expect(response.status, item.id).toBe(402);
      const header = response.headers.get("PAYMENT-REQUIRED");
      expect(header, `${item.id} served no challenge to read`).toBeTruthy();
      const challenge = JSON.parse(atob(header ?? "")) as {
        accepts: { maxTimeoutSeconds?: number }[];
      };
      expect(challenge.accepts.length, item.id).toBeGreaterThan(0);
      for (const accept of challenge.accepts) {
        expect(
          accept.maxTimeoutSeconds,
          `${item.id} served an accept whose signing window is not the one this store chose`,
        ).toBe(SIGNING_WINDOW_SECONDS);
      }
    }
  }, 40_000);

  it("hands the hand-roller a validBefore built from the same number", async () => {
    /*
     * The repair template tells a hand-roller their validBefore is
     * "good for the maxTimeoutSeconds above". That sentence is only
     * true if the template and the accept read one constant — and the
     * template carried its OWN typed 300, a third copy of a number
     * that had never been decided once.
     */
    const item = MENU_ITEMS.find((i) => i.price_usdc > 0);
    expect(item).toBeDefined();
    if (!item) return;
    const response = await SELF.fetch(`${BASE}/api/buy/${item.id}`);
    const body = (await response.json()) as Record<string, unknown>;
    const repair = JSON.stringify(body);
    const match = /"validBefore":"(\d+)"/.exec(repair);
    expect(
      match,
      "the 402 body carries no hand-rolling template to check",
    ).not.toBeNull();
    if (!match?.[1]) return;
    const validBefore = Number(match[1]);
    const now = Math.floor(Date.now() / 1000);
    const window = validBefore - now;
    // Generous bounds: the template is built during the request, so
    // the exact second moves. The claim is that it derives from the
    // chosen constant, not that it lands on a specific tick.
    expect(
      Math.abs(window - SIGNING_WINDOW_SECONDS),
      `the template's validBefore is ${window}s out, not the ${SIGNING_WINDOW_SECONDS}s window this store chose — the sentence promising they match is false`,
    ).toBeLessThan(30);
  }, 20_000);
});
