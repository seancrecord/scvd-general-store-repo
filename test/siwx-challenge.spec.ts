import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { KV_KEYS } from "@/lib/kv-keys";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * SIWX ON THE CLAIMS DOOR (CAIP-122, P4 of the Circle-badge slate).
 * Two properties: the served challenge is a standard message every
 * SIWE library renders and signs natively, and the upgrade broke no
 * in-flight legacy challenge — the KV record says which format each
 * challenge used, and verification rebuilds exactly that text.
 */
describe("the challenge speaks CAIP-122", () => {
  it("serves the standard fields on the EVM rail", async () => {
    const account = privateKeyToAccount(`0x${"7".repeat(64)}`);
    const response = await SELF.fetch(`${BASE}/api/claims/challenge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: account.address }),
    });
    const body = (await response.json()) as { challenge: string; format: string };
    expect(body.challenge).toContain(
      "scvd.store wants you to sign in with your Ethereum account:",
    );
    expect(body.challenge).toContain(account.address.toLowerCase());
    expect(body.challenge).toContain("Chain ID: eip155:8453");
    expect(body.challenge).toMatch(/Nonce: [0-9a-f]{32}/);
    expect(body.challenge).toMatch(/Issued At: \d{4}-/);
    expect(body.challenge).toMatch(/Expiration Time: \d{4}-/);
    expect(body.format).toContain("CAIP-122");
  });

  it("signs and claims end to end with plain personal_sign — no SIWX-specific client code", async () => {
    const account = privateKeyToAccount(`0x${"8".repeat(64)}`);
    const challenge = (
      (await (
        await SELF.fetch(`${BASE}/api/claims/challenge`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: account.address }),
        })
      ).json()) as { challenge: string }
    ).challenge;
    const signature = await account.signMessage({ message: challenge });
    const claim = await SELF.fetch(`${BASE}/api/claims`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: account.address, signature }),
    });
    expect(claim.status).toBe(200);
  });

  it("keeps verifying a legacy bare-nonce challenge through the transition", async () => {
    const account = privateKeyToAccount(`0x${"9".repeat(64)}`);
    const canonical = account.address.toLowerCase();
    // Seed the pre-upgrade KV shape: the bare nonce string.
    const nonce = "a".repeat(32);
    await testEnv.COUNTERS.put(KV_KEYS.claimChallenge(canonical), nonce);
    const legacyText = `scvd-claims-v1\n${canonical}\n${nonce}`;
    const signature = await account.signMessage({ message: legacyText });
    const claim = await SELF.fetch(`${BASE}/api/claims`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: account.address, signature }),
    });
    expect(claim.status).toBe(200);
  });
});
