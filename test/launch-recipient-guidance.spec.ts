import { SELF, env } from "cloudflare:test";
import { beforeAll, expect, it } from "vitest";
import { fieldSignerFromKey, performLaunchCheck, storeLaunchCheck } from "@/services/launch-check";
import type { SignedLaunchCheck, TransferClaimReader, TxHashStatus } from "@/services/launch-check";
import { verifyAsync } from "@noble/ed25519";
import { launchCheckNote } from "@/store/copy/deliverables";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import type { Env } from "@/types";

const e = env as Env;
const base = "https://scvd.store";
const target = "https://recipient-fixture.example/paid";
const recipient = "0x2222222222222222222222222222222222222222";
const txHash = `0x${"ab".repeat(32)}`;
beforeAll(installFacilitatorMock);

// Throwaway local signer, fixture seller and injected chain readings. Nothing
// here submits a real payment or claims to verify a live seller's receipt.
async function publish(readClaim?: TransferClaimReader, receipt: string | null = txHash, unpaid = false) {
  const check = await performLaunchCheck(e, target, {
    now: new Date("2026-09-12T12:00:00Z"),
    signer: await fieldSignerFromKey(`0x${"01".repeat(32)}`),
    screen: async () => ({ listed: false, source: "local fixture" }),
    readClaim,
    fetch: async (_url, init) => {
      if (unpaid) return Response.json({ message: "Free fixture" });
      if (!new Headers(init?.headers).has("PAYMENT-SIGNATURE")) {
        return Response.json({ accepts: [{ scheme: "exact", network: "eip155:8453", amount: "10000",
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", payTo: recipient, maxTimeoutSeconds: 60 }] }, { status: 402 });
      }
      return Response.json({ artifact: "same-original-fixture" }, {
        headers: receipt === null ? {} : { "PAYMENT-RESPONSE": btoa(JSON.stringify({ transaction: receipt })) },
      });
    },
  });
  await storeLaunchCheck(e, check, "recipient-fixture-cert", check.observed_at);
  const response = await SELF.fetch(`${base}/api/launch-check/${check.check_id}`);
  expect(response.status).toBe(200);
  const body = await response.json() as { check: SignedLaunchCheck; how_to_verify: string[]; certificate: string };
  expect(body.check).toEqual(check);
  expect(body.certificate).toBe(`${base}/api/verify/recipient-fixture-cert`);
  return { ...body, instructions: body.how_to_verify.join("\n") };
}

const receiptRead = (status: Awaited<ReturnType<TransferClaimReader>>["status"]): TransferClaimReader =>
  async (_hash, query) => ({ status, payer: query.payer ?? null, recipient, amountUsdc: 9,
    blockHeight: 123, confirmations: status === "PENDING_FINALITY" ? 1 : 20 });

it.each([
  ["SETTLED", "confirmed_on_chain"],
  ["PENDING_FINALITY", "confirmed_on_chain"],
  ["NOT_FOUND", "claimed"],
  ["REVERTED", "contradicted"],
  ["INSUFFICIENT_MATCH", "contradicted"],
] as const)("explains the actual %s receipt outcome without asserting exact purchase settlement", async (chainStatus, expected) => {
  const { check, instructions } = await publish(receiptRead(chainStatus));
  expect(check.tx_hash_status).toBe(expected satisfies TxHashStatus);
  expect(instructions).toContain(`"${check.tx_hash_status}"`);
  expect(instructions).not.toContain('"confirmed"');
  expect(instructions).toContain("tx_verification.chain_status");
  expect(instructions).toContain("tx_verification.confirmations");
  // Deliberately a different amount: the current chain read only asks about
  // the accounts. Its published guide must not erase this retained gap.
  expect(check.payment_attempt?.settlement).toBe("unknown");
  expect(check.tx_verification?.observed_amount_usdc).toBe(9);
  expect(instructions).toContain("exact authorization nonce and amount");
  expect(instructions).toContain("payment_attempt.settlement");
});

it("explains an identifier that the chain reader cannot use", async () => {
  const { check, instructions } = await publish(undefined, "not-a-chain-hash");
  expect(check.tx_hash_status).toBe("unverifiable_shape");
  expect(instructions).toContain(`"${check.tx_hash_status}"`);
  expect(instructions).toContain("no chain read");
});

it.each(["SETTLED", "PENDING_FINALITY"] as const)("the delivery note agrees with an actual %s report", async (status) => {
  const { check } = await publish(receiptRead(status));
  const note = launchCheckNote(check.verdict, check.replay_served, check.tx_hash_status, check.replay?.outcome);
  expect(check.tx_hash_status).toBe("confirmed_on_chain");
  expect(note).not.toContain("chain read did not confirm");
  expect(note).toContain("USDC transfer");
  expect(note).toContain("tx_verification");
  expect(note).toContain("exact authorization nonce and amount");
  expect(note).not.toContain("verified settlement");
});

it("separates missing receipt from an unpaid walk", async () => {
  const paid = await publish(undefined, null);
  const unpaid = await publish(undefined, null, true);
  expect(paid.check.tx_hash_status).toBeNull();
  expect(paid.check.paid_usd).toBeGreaterThan(0);
  expect(unpaid.check.tx_hash_status).toBeNull();
  expect(unpaid.check.paid_usd).toBe(0);
  for (const report of [paid, unpaid]) {
    expect(report.instructions).toContain("null");
    expect(report.instructions).toContain("not proof that no money moved");
    expect(report.instructions).toContain("authorization_outstanding_until");
  }
});

it("gives a recipient a key-history path and a signature check that detects tampering", async () => {
  const { check, instructions } = await publish();
  expect(check.tx_hash_status).toBe("claimed");
  expect(instructions).toContain("check.public_key");
  expect(instructions).toContain("key_history");
  expect(instructions).toContain("does not prove the claim true");
  expect(instructions).toContain(`${base}/.well-known/scvd-signing-key`);
  const registry = await (await SELF.fetch(`${base}/.well-known/scvd-signing-key`)).json() as {
    key_history: { current: { public_key: string }; retired: Array<{ public_key: string }> };
  };
  const published = [registry.key_history.current, ...registry.key_history.retired];
  expect(published.some(key => key.public_key === check.public_key)).toBe(true);
  const { signature, public_key, signature_covers: _description, ...observation } = check;
  const hex = (value: string) => Uint8Array.from(value.match(/../g)!, byte => Number.parseInt(byte, 16));
  const verify = (value: object) => verifyAsync(hex(signature), new TextEncoder().encode(JSON.stringify(value)), hex(public_key));
  expect(await verify(observation)).toBe(true);
  expect(await verify({ ...observation, url: "https://different.example/" })).toBe(false);
});
