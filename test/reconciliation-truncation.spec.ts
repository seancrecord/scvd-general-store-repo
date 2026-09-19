import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { reconcileSettles } from "@/lib/metrics";
import { readBuyers } from "@/services/buyers";
import { certificatesAgainstSettles } from "@/services/settle-sources";
import type { Env } from "@/types";

/**
 * A LOOKUP THAT CANNOT SEE EVERYTHING MUST NOT ANSWER "OK" (rule 52).
 *
 * reconcileSettles said in its own docstring that a reconciliation
 * which silently compares against the first fifty wallets is worse
 * than none, and then never read `truncated` off any of its three
 * walks. The buyers desk and the third witness read the certificate
 * side's cap and not the payer side's. The caps are far above today's
 * volume, so nothing here is a wrong number today; it is the day a
 * cap is hit that these fields exist for. Held by forcing the cap on
 * one prefix at a time through the same listKeys every reader uses.
 */
const fault = vi.hoisted(() => ({ prefixes: new Set<string>() }));
vi.mock("@/lib/kv-list", async (original) => {
  const actual = await original<typeof import("@/lib/kv-list")>();
  return { ...actual, listKeys: async (...args: Parameters<typeof actual.listKeys>) => {
    const result = await actual.listKeys(...args);
    return fault.prefixes.has(args[1].prefix ?? "") ? { ...result, truncated: true } : result;
  } };
});

const testEnv = env as unknown as Env;
afterEach(() => { fault.prefixes.clear(); });

describe("the books say which walk hit its cap", () => {
  it("a whole read says so, and the arithmetic is the same either way", async () => {
    const whole = await reconcileSettles(testEnv);
    expect(whole.truncated).toEqual([]);
    expect(whole.reading).toMatch(/^Every list was read to its end/);
    fault.prefixes.add(KV_KEYS.payerPrefix);
    const capped = await reconcileSettles(testEnv);
    expect(capped.truncated).toEqual(["payer rows"]);
    expect(capped.reading).toMatch(/^INCOMPLETE: the walk over payer rows hit its cap/);
    // The flag is additive: the figures a reader always got are untouched.
    for (const field of ["counter_settles", "payer_purchases", "settle_records", "founding", "unattributed", "unexplained"] as const) {
      expect(capped[field], field).toBe(whole[field]);
    }
  });

  it("names every capped walk, in the order the reconciliation reads them", async () => {
    fault.prefixes.add("metric:");
    fault.prefixes.add(KV_KEYS.payerSettlePrefix());
    const capped = await reconcileSettles(testEnv);
    expect(capped.truncated).toEqual(["metric counters", "per-settle records"]);
    expect(capped.reading).toContain("metric counters and per-settle records");
  });

  it("the buyers desk and the third witness report the payer side's cap beside the certificate side's", async () => {
    const wholeBuyers = await readBuyers(testEnv);
    const wholeWitness = await certificatesAgainstSettles(testEnv, null);
    expect(wholeBuyers.payer_rows_truncated).toBe(false);
    expect(wholeWitness.payer_rows_truncated).toBe(false);
    fault.prefixes.add(KV_KEYS.payerPrefix);
    const buyers = await readBuyers(testEnv);
    const witness = await certificatesAgainstSettles(testEnv, null);
    expect(buyers.payer_rows_truncated).toBe(true);
    expect(buyers.certificates_truncated).toBe(false);
    expect(witness.payer_rows_truncated).toBe(true);
    expect(witness.certificates_truncated).toBe(false);
  });
});
