import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { BASE_EVM, POLYGON_EVM, TRANSFER_TOPIC, type RpcLog, type EvmChain } from "@/lib/base-rpc";
import { AUTH_CAPTURE_CONTRACTS } from "@/lib/auth-capture-escrow";
import { observeWithFacts, SETTLEMENT_ATTESTATION_BATTERY, type AttestationQuery } from "@/services/attestation";
import { ARTIFACT_CLASSES } from "@/store/attestation-spec";
import type { Env } from "@/types";
import { verifyMessageSignature } from "@/lib/signing";

/*
 * THE ESCROW LEG, NAMED (2026-09-28). Under x402 auth-capture's escrow
 * flow the hash a buyer holds is an authorize: USDC goes payer →
 * collector → AuthCaptureEscrow, and the seller is paid by a later
 * capture. Before this battery the desk read that hash as
 * INSUFFICIENT_MATCH with a `none` binding and could not say why. It
 * still reads it that way — the status never moves — but it now names
 * the contact, inside the signature, so a reader knows to look for the
 * capture instead of concluding the seller was paid the wrong party.
 */

const payer = `0x${"11".repeat(20)}`;
const seller = `0x${"22".repeat(20)}`;
const txHash = `0x${"cd".repeat(32)}`;
const escrow = AUTH_CAPTURE_CONTRACTS.find((c) => c.role === "escrow" && c.deployment === "v1.1")!.address;
const collector = AUTH_CAPTURE_CONTRACTS.find((c) => c.role === "eip3009_collector" && c.deployment === "v1.1")!.address;
const oldEscrow = AUTH_CAPTURE_CONTRACTS.find((c) => c.role === "escrow" && c.deployment === "v1.0")!.address;
const topic = (a: string) => `0x${a.slice(2).padStart(64, "0")}`;
const transfer = (from: string, to: string, amount = 10000n, asset = BASE_EVM.usdc): RpcLog => ({
  address: asset, topics: [TRANSFER_TOPIC, topic(from), topic(to)], data: `0x${amount.toString(16).padStart(64, "0")}`,
});
const observe = (logs: RpcLog[], asked: AttestationQuery, chain: EvmChain = BASE_EVM) =>
  observeWithFacts(env as Env, asked, { transactionHash: txHash, status: "0x1", blockNumber: "0x64", logs }, 140, chain, {}, new Date("2026-09-28T12:00:00Z"));

describe("the attestation desk names contact with the auth-capture escrow set", () => {
  it("an authorize leg asked about with the seller as recipient stays INSUFFICIENT_MATCH and says the hold went into the escrow", async () => {
    const signed = await observe([transfer(payer, collector), transfer(collector, escrow)], { txHash, payer, recipient: seller, amountUsdc: 0.01 });
    expect(signed.status).toBe("INSUFFICIENT_MATCH");
    expect(signed.binding.class).toBe("none");
    expect(signed.auth_capture).toMatchObject({
      scheme: "auth-capture",
      legs: [
        { role: "eip3009_collector", deployment: "v1.1", direction: "into", amount_atomic: "10000" },
        { role: "eip3009_collector", deployment: "v1.1", direction: "out_of", amount_atomic: "10000" },
        { role: "escrow", deployment: "v1.1", direction: "into", amount_atomic: "10000" },
      ],
    });
    expect(signed.auth_capture!.reading).toContain("capture pays the seller out of it later");
    expect(signed.auth_capture!.reading).toContain("did not read the escrow's payment state");
    expect(signed.auth_capture!.source).toContain("scheme_auth_capture_evm.md");
  });

  it("a capture leg to the seller reads SETTLED as before, with the escrow named as the source of the funds", async () => {
    const signed = await observe([transfer(escrow, seller)], { txHash, recipient: seller, amountUsdc: 0.01 });
    expect(signed.status).toBe("SETTLED");
    expect(signed.recipient).toBe(seller);
    expect(signed.auth_capture?.legs).toEqual([
      { contract: escrow, role: "escrow", deployment: "v1.1", direction: "out_of", amount_atomic: "10000" },
    ]);
  });

  it("tells the v1.0 set from the v1.1 set, on Polygon as on Base", async () => {
    const signed = await observe([transfer(payer, oldEscrow, 10000n, POLYGON_EVM.usdc)], { txHash, payer }, POLYGON_EVM);
    expect(signed.chain).toBe(POLYGON_EVM.caip2);
    expect(signed.auth_capture?.legs).toEqual([
      { contract: oldEscrow, role: "escrow", deployment: "v1.0", direction: "into", amount_atomic: "10000" },
    ]);
  });

  it("an ordinary exact transfer carries no auth_capture field, under a battery that says it looked", async () => {
    const signed = await observe([transfer(payer, seller)], { txHash, payer, recipient: seller, amountUsdc: 0.01 });
    expect(signed.status).toBe("SETTLED");
    expect(signed.auth_capture).toBeUndefined();
    expect(signed.battery).toBe("settlement-attestation-v5");
    expect(SETTLEMENT_ATTESTATION_BATTERY).toBe("settlement-attestation-v5");
  });

  it("the contact sits inside both signatures and its alteration breaks them", async () => {
    const signed = await observe([transfer(collector, escrow)], { txHash });
    const { signature, public_key, signature_covers: _a, signature_jcs: _b, signature_jcs_covers: _c,
      received_not_observed: _d, projection: _e, ...observation } = signed;
    expect(await verifyMessageSignature(JSON.stringify(observation), signature, public_key)).toBe(true);
    const tampered = structuredClone(observation);
    delete (tampered as { auth_capture?: unknown }).auth_capture;
    expect(await verifyMessageSignature(JSON.stringify(tampered), signature, public_key)).toBe(false);
    const keys = Object.keys(signed);
    expect(keys.indexOf("auth_capture")).toBeLessThan(keys.indexOf("signature"));
    expect(keys.indexOf("auth_capture")).toBeGreaterThan(keys.indexOf("binding"));
  });

  it("the declaration page says the desk names the contact and does not read the lifecycle", () => {
    const entry = ARTIFACT_CLASSES.find((c) => c.id === "settlement_attestation")!;
    expect(entry.signs).toContain("auth_capture");
    expect(entry.signs).toContain("settlement-attestation-v5");
    expect(entry.does_not_prove).toContain("lifecycle");
  });
});
