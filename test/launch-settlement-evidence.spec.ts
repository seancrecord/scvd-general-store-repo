import { env } from "cloudflare:test";
import { expect, it } from "vitest";
import { fieldSignerFromKey, performLaunchCheck } from "@/services/launch-check";
import type { Env } from "@/types";

it("a seller-named transfer does not establish settlement of this exact authorization", async () => {
  const signer = await fieldSignerFromKey(`0x${"01".repeat(32)}`);
  const recipient = "0x2222222222222222222222222222222222222222";
  const report = await performLaunchCheck(env as unknown as Env, "https://fixture.example/paid", {
    signer, screen: async () => ({ listed: false, source: "local clear screen" }),
    // A real-looking transfer between the same accounts, for a different amount.
    // This read does not correlate the authorization nonce to the transaction.
    readClaim: async () => ({ status: "SETTLED", blockHeight: 123, confirmations: 20,
      payer: signer.address, recipient, amountUsdc: 9 }),
    fetch: async (_url, init) => {
      if (!new Headers(init?.headers).has("PAYMENT-SIGNATURE")) return Response.json({ accepts: [{ scheme: "exact", network: "eip155:8453", amount: "10000", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", payTo: recipient, maxTimeoutSeconds: 60 }] }, { status: 402 });
      return Response.json({ good: "fixture" }, { headers: { "PAYMENT-RESPONSE": btoa(JSON.stringify({ transaction: `0x${"ab".repeat(32)}` })) } });
    },
  });
  expect(report.tx_hash_status).toBe("confirmed_on_chain");
  expect(report.payment_attempt?.amount_atomic).toBe("10000");
  expect(report.payment_attempt?.settlement).toBe("unknown");
});
