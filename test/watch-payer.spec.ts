import { env } from "cloudflare:test";
import { expect, it } from "vitest";
import { canonicalAddress } from "@/lib/addresses";
import { startWatch, watchesForPayer } from "@/services/standing-watch";
import { startConformanceWatch } from "@/services/conformance-watch";
import type { Env } from "@/types";

const bindings = env as unknown as Env;
const payer = "DGxcPrAHL9YM3hW7iXuHFJmr87Zr6AMA4jCYHBpuvMgE";
const differentPayer = payer.slice(0, -1) + "e";
for (const [kind, start] of [["standing", startWatch], ["conformance", startConformanceWatch]] as const) {
  it(`${kind}: stores the exact Solana payer`, async () => {
    const result = await start(bindings, "https://buyer-fixture.example/solana", payer);
    expect(result.record.payer).toBe(payer);
  });
  it(`${kind}: a different base58 wallet cannot claim the buyer's watch`, async () => {
    const own = await start(bindings, "https://buyer-fixture.example/own", payer);
    const other = await start(bindings, "https://buyer-fixture.example/other", differentPayer);
    const found = await watchesForPayer(bindings, payer);
    expect(found.watches.map(watch => watch.watch_id)).toContain(own.record.watch_id);
    expect(found.watches.map(watch => watch.watch_id)).not.toContain(other.record.watch_id);
  });
}
it("normalizes EVM prefix casing while preserving base58", () => {
  expect(canonicalAddress("0X" + "AB".repeat(20))).toBe("0x" + "ab".repeat(20));
  expect(canonicalAddress(payer)).toBe(payer);
});
