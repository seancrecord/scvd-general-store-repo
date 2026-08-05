import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { canonicalAddress } from "@/lib/addresses";
import { KV_KEYS } from "@/lib/kv-keys";
import { mintCertificate } from "@/services/certificates";
import type { Env, PayerRecord } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const AUTH = {
  Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
};

// A base58 Solana address: case-sensitive, no 0x.
const SOLANA = "GuHrGgNu8FCaGpv7iL1XJa4P3XoM31AuicMxD58NkL4j";

/**
 * The night the first Solana buyer arrived, the payer rows
 * lowercased their base58 address into a string no explorer
 * resolves. These pin the whole fix: canonical form (EVM lowered,
 * base58 preserved), the repair recovering true case from the
 * certificates, and idempotency.
 */
describe("payer address case", () => {
  it("canonicalAddress lowers EVM, preserves base58", () => {
    expect(canonicalAddress("0xAbCd00000000000000000000000000000000EF12")).toBe(
      "0xabcd00000000000000000000000000000000ef12",
    );
    expect(canonicalAddress(` ${SOLANA} `)).toBe(SOLANA);
  });

  it("repairs a corrupted payer row from the certificate's true case", async () => {
    // The bug's artifact: a row keyed and valued in lowercase.
    const corruptedKey = `${KV_KEYS.payerPrefix}${SOLANA.toLowerCase()}`;
    await testEnv.COUNTERS.put(
      corruptedKey,
      JSON.stringify({
        address: SOLANA.toLowerCase(),
        first_seen: "2026-08-04T19:26:00.000Z",
        last_seen: "2026-08-04T19:47:00.000Z",
        purchases: 21,
      }),
    );
    // The cert kept the truth.
    await mintCertificate(testEnv, {
      itemId: "hello",
      paidUsdc: 0.5,
      payer: SOLANA,
      settlementTx: `sol${"d".repeat(60)}`,
      network: "solana:mainnet",
    });

    const response = await SELF.fetch(`${BASE}/admin/repair/payer-case`, {
      method: "POST",
      headers: AUTH,
    });
    expect(response.status).toBe(200);
    const result = (await response.json()) as { repaired: string[] };
    expect(result.repaired).toContain(SOLANA);

    const healed = await testEnv.COUNTERS.get<PayerRecord>(
      KV_KEYS.payer(SOLANA),
      "json",
    );
    expect(healed?.address).toBe(SOLANA);
    expect(healed?.purchases).toBe(21);
    expect(await testEnv.COUNTERS.get(corruptedKey)).toBeNull();

    // Idempotent: a second press finds nothing.
    const again = await SELF.fetch(`${BASE}/admin/repair/payer-case`, {
      method: "POST",
      headers: AUTH,
    });
    const secondResult = (await again.json()) as { repaired: string[] };
    expect(secondResult.repaired).not.toContain(SOLANA);

    await testEnv.COUNTERS.delete(KV_KEYS.payer(SOLANA));
  });

  it("payer key is canonical: base58 keys keep their case", () => {
    expect(KV_KEYS.payer(SOLANA)).toBe(`payer:${SOLANA}`);
    expect(KV_KEYS.payer("0xABC")).toBe("payer:0xabc");
  });
});
