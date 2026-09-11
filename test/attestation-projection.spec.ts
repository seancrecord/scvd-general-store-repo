import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { BASE_EVM, TRANSFER_TOPIC } from "@/lib/base-rpc";
import type { RpcReceipt } from "@/lib/base-rpc";
import { jcsCanonicalize } from "@/lib/jcs";
import { verifyOwnJws } from "@/lib/offer-receipt";
import { observeWithFacts } from "@/services/attestation";
import {
  PROJECTION_CONFORMANCE,
  PROJECTION_FORMAT,
} from "@/services/attestation-projection";
import { ARTIFACT_CLASSES } from "@/store/attestation-spec";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE PROJECTION (2026-09-11). A second shape for the same
 * observation, in the vocabulary an IETF draft is converging on. It
 * carries nothing the native artifact did not derive, points back by
 * evidence hash, is signed by the same key with the same expiry, pins
 * the draft revision it targets, and says on every copy that its
 * conformance is unverified because the draft text could not be read
 * from where this was built. Never the record.
 */
const PAYER = "0x1111111111111111111111111111111111111111";
const PAYEE = "0x2222222222222222222222222222222222222222";
const TX = `0x${"ab".repeat(32)}`;

function topicFor(address: string): string {
  return `0x000000000000000000000000${address.slice(2)}`;
}

const RECEIPT: RpcReceipt = {
  status: "0x1",
  blockNumber: "0x64",
  logs: [
    {
      address: BASE_EVM.usdc,
      topics: [TRANSFER_TOPIC, topicFor(PAYER), topicFor(PAYEE)],
      data: "0xfa0",
    },
  ],
};

describe("a projection, never the record", () => {
  it("points back to the native artifact and says it is not primary", async () => {
    const signed = await observeWithFacts(testEnv, { txHash: TX }, RECEIPT, 140);
    const projection = signed.projection;
    expect(projection.primary).toBe(false);
    expect(projection.projection_of.evidence_hash).toBe(signed.evidence_hash);
    expect(projection.projection_of.battery).toBe(signed.battery);
    expect(projection.projection_of.cite).toContain("never this projection");
  });

  it("pins the draft revision and admits the conformance is unverified", async () => {
    const signed = await observeWithFacts(testEnv, { txHash: TX }, RECEIPT, 140);
    expect(PROJECTION_FORMAT).toMatch(/^draft-hopley-x402-settlement-attestation-\d{2}$/);
    expect(signed.projection.format).toBe(PROJECTION_FORMAT);
    expect(signed.projection.conformance).toBe(PROJECTION_CONFORMANCE);
    expect(signed.projection.conformance).toContain("unverified");
    expect(signed.projection.conformance).toContain("Not a conformance claim");
  });

  it("carries no field the native artifact did not derive", async () => {
    const signed = await observeWithFacts(testEnv, { txHash: TX }, RECEIPT, 140);
    const p = signed.projection;
    expect(p.settlement_chain).toBe(signed.chain);
    expect(p.transaction).toBe(signed.tx_hash);
    expect(p.payer).toBe(signed.payer);
    expect(p.recipient).toBe(signed.recipient);
    expect(p.amount_usdc).toBe(signed.amount_usdc);
    expect(p.block_height).toBe(signed.block_height);
    expect(p.confirmations).toBe(signed.confirmations);
    expect(p.observed_at).toBe(signed.observed_at);
    // Same expiry, under the draft's name for it.
    expect(p.expires).toBe(signed.stale_after);
    expect(p.binding).toEqual(signed.binding);
    // What we do not hold, we do not reference.
    expect(p.settled_payment_ref).toBeNull();
  });

  it("maps only the statuses the draft names, and keeps ours beside them", async () => {
    const settled = await observeWithFacts(testEnv, { txHash: TX }, RECEIPT, 140);
    expect(settled.projection.settlement_result).toBe("SETTLED");
    expect(settled.projection.native_status).toBe("SETTLED");
    const mismatch = await observeWithFacts(testEnv, { txHash: TX, amountUsdc: 99 }, RECEIPT, 140);
    expect(mismatch.status).toBe("INSUFFICIENT_MATCH");
    expect(mismatch.projection.settlement_result).toBeNull();
    expect(mismatch.projection.native_status).toBe("INSUFFICIENT_MATCH");
    // REVERTED is not REVERSED: a failed transaction is not a reversal.
    const reverted = await observeWithFacts(testEnv, { txHash: TX }, { status: "0x0", blockNumber: "0x64", logs: [] }, 140);
    expect(reverted.projection.settlement_result).toBeNull();
  });

  it("is signed by the same key, as a detached JWS over its own RFC 8785 bytes", async () => {
    const signed = await observeWithFacts(testEnv, { txHash: TX }, RECEIPT, 140);
    const { signature_jws, signature_covers: _c, ...body } = signed.projection;
    const [header, empty, signature] = signature_jws.split(".");
    expect(empty).toBe("");
    const payload = btoa(jcsCanonicalize(body)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const { valid } = await verifyOwnJws(testEnv, `${header}.${payload}.${signature}`);
    expect(valid).toBe(true);
    const decodedHeader = JSON.parse(atob(header!.replace(/-/g, "+").replace(/_/g, "/"))) as Record<string, unknown>;
    expect(String(decodedHeader.kid)).toMatch(/^did:web:scvd\.store#key-\d+$/);
    expect(signed.projection.issuer_did).toBe("did:web:scvd.store");
  });

  it("sits outside the native signatures, after them", async () => {
    const signed = await observeWithFacts(testEnv, { txHash: TX }, RECEIPT, 140);
    const keys = Object.keys(signed);
    expect(keys.indexOf("projection")).toBeGreaterThan(keys.indexOf("signature_jcs_covers"));
    expect(signed.signature_covers).toContain("projection");
    const entry = ARTIFACT_CLASSES.find((c) => c.id === "settlement_attestation")!;
    expect(entry.signs).toContain("never the record");
  });
});
