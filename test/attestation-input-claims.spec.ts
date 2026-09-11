import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { AUTHORIZATION_USED_TOPIC, BASE_EVM, TRANSFER_TOPIC } from "@/lib/base-rpc";
import type { RpcReceipt } from "@/lib/base-rpc";
import { verifyMessageSignature } from "@/lib/signing";
import { observeWithFacts } from "@/services/attestation";
import {
  compareClaim,
  decodeSettlementResponseClaim,
  normalizeClaimedNetwork,
  sha256Hex,
} from "@/services/attestation-claims";
import { ARTIFACT_CLASSES } from "@/store/attestation-spec";
import { isRecord } from "@/types";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * RECEIVED, NOT OBSERVED (2026-09-11). A facilitator's settlement
 * response is accepted as input and never as fact. Structurally: its
 * bytes never enter the signed payload; their digest and a per-field
 * agreement table do, and the bytes are echoed outside the signature
 * so both are checkable. The product is one line — "the response said
 * payer X; the chain shows Y" — and it is a finding about the
 * response, not a verdict on anyone.
 */
const PAYER = "0x1111111111111111111111111111111111111111";
const FACILITATOR = "0xfacefacefacefacefacefacefacefacefaceface";
const PAYEE = "0x2222222222222222222222222222222222222222";
const TX = `0x${"ab".repeat(32)}`;
const HEAD = 140;

function topicFor(address: string): string {
  return `0x000000000000000000000000${address.slice(2)}`;
}

function settledReceipt(): RpcReceipt {
  return {
    status: "0x1",
    blockNumber: "0x64",
    logs: [
      {
        address: BASE_EVM.usdc,
        topics: [TRANSFER_TOPIC, topicFor(PAYER), topicFor(PAYEE)],
        data: "0xfa0",
      },
      {
        address: BASE_EVM.usdc,
        topics: [AUTHORIZATION_USED_TOPIC, topicFor(PAYER), `0x${"cd".repeat(32)}`],
        data: "0x",
      },
    ],
  };
}

function header(claim: Record<string, unknown>): string {
  return btoa(JSON.stringify(claim));
}

describe("reading the response as the buyer holds it", () => {
  it("decodes the header verbatim and its JSON alike", () => {
    const claim = { success: true, transaction: TX, network: "eip155:8453", payer: PAYER };
    expect(decodeSettlementResponseClaim(header(claim))).toEqual(claim);
    expect(decodeSettlementResponseClaim(JSON.stringify(claim))).toEqual(claim);
  });

  it("refuses bytes that name none of the four fields", () => {
    expect(decodeSettlementResponseClaim("not-json-not-base64!!")).toBeNull();
    expect(decodeSettlementResponseClaim(header({ hello: "world" }))).toBeNull();
    expect(decodeSettlementResponseClaim("")).toBeNull();
  });

  it("reads v1 network names as the v2 ids they mean", () => {
    expect(normalizeClaimedNetwork("base")).toBe("eip155:8453");
    expect(normalizeClaimedNetwork("eip155:137")).toBe("eip155:137");
  });
});

describe("the agreement table, row by row", () => {
  const observed = { txHash: TX, chain: "eip155:8453", payer: PAYER, status: "SETTLED" as const };

  it("agrees on every field when the response tells the chain's story", () => {
    expect(
      compareClaim({ success: true, transaction: TX.toUpperCase().replace("0X", "0x"), network: "base", payer: PAYER }, observed),
    ).toEqual({ transaction: "agrees", network: "agrees", payer: "agrees", success: "agrees" });
  });

  it("the Hedera trap: a payer that names the fee payer disagrees with the chain", () => {
    expect(compareClaim({ payer: FACILITATOR }, observed).payer).toBe("disagrees");
  });

  it("not_claimed and not_observed are kept apart from disagreement", () => {
    expect(compareClaim({ success: true }, observed).payer).toBe("not_claimed");
    const notFound = { ...observed, payer: null, status: "NOT_FOUND" as const };
    expect(compareClaim({ payer: PAYER, network: "eip155:137" }, notFound)).toMatchObject({
      payer: "not_observed",
      network: "not_observed",
    });
  });

  it("a claim of success beside a chain that shows nothing disagrees; beside a revert too", () => {
    expect(compareClaim({ success: true }, { ...observed, payer: null, status: "NOT_FOUND" }).success).toBe("disagrees");
    expect(compareClaim({ success: true }, { ...observed, payer: null, status: "REVERTED" }).success).toBe("disagrees");
    expect(compareClaim({ success: false }, { ...observed, payer: null, status: "REVERTED" }).success).toBe("agrees");
    expect(compareClaim({ success: true }, { ...observed, status: "INSUFFICIENT_MATCH" }).success).toBe("not_observed");
  });
});

describe("on the artifact: digest and table inside, bytes outside", () => {
  it("signs the digest and the table, never the facilitator's values", async () => {
    const raw = header({ success: true, transaction: TX, network: "base", payer: FACILITATOR });
    const signed = await observeWithFacts(testEnv, { txHash: TX, paymentResponse: raw }, settledReceipt(), HEAD);
    expect(signed.status).toBe("SETTLED");
    expect(signed.input_claims).toBeTruthy();
    expect(signed.input_claims!.standing).toBe("received, not observed");
    expect(signed.input_claims!.received_sha256).toBe(await sha256Hex(raw));
    expect(signed.input_claims!.agreement).toEqual({
      transaction: "agrees",
      network: "agrees",
      payer: "disagrees",
      success: "agrees",
    });
    expect(signed.input_claims!.reading).toContain(`not the payer the chain shows (${PAYER})`);
    expect(signed.input_claims!.reading).not.toContain(FACILITATOR);

    // The signed bytes: every field above signature. The facilitator's
    // payer must not be in them, and the raw response must not either.
    const {
      signature,
      public_key,
      signature_covers: _c,
      signature_jcs: _j,
      signature_jcs_covers: _jc,
      received_not_observed,
      projection: _p,
      ...observation
    } = signed;
    const signedBytes = JSON.stringify(observation);
    expect(await verifyMessageSignature(signedBytes, signature, public_key)).toBe(true);
    expect(signedBytes).not.toContain(FACILITATOR);
    expect(signedBytes).not.toContain(raw);
    expect((observation.query as Record<string, unknown>).paymentResponse).toBeUndefined();

    // The echo, outside, exact, and hashing to the signed digest.
    expect(received_not_observed).toBeTruthy();
    expect(received_not_observed!.payment_response).toBe(raw);
    expect(received_not_observed!.sha256).toBe(signed.input_claims!.received_sha256);
    expect(received_not_observed!.decoded.payer).toBe(FACILITATOR);
    const keys = Object.keys(signed);
    expect(keys.indexOf("received_not_observed")).toBeGreaterThan(keys.indexOf("signature_jcs_covers"));
    expect(signed.signature_covers).toContain("received_not_observed");
  });

  it("carries neither half when no response was given", async () => {
    const signed = await observeWithFacts(testEnv, { txHash: TX }, settledReceipt(), HEAD);
    expect(signed.input_claims).toBeUndefined();
    expect(signed.received_not_observed).toBeUndefined();
  });

  it("the declaration page says the claims are received, not observed", () => {
    const entry = ARTIFACT_CLASSES.find((c) => c.id === "settlement_attestation")!;
    expect(entry.signs).toContain("input_claims");
    expect(entry.signs).toContain("never the claimed values themselves");
    expect(entry.does_not_prove).toContain("received, not observed");
  });
});

describe("the door, before money moves", () => {
  const buying = { "PAYMENT-SIGNATURE": "not-a-real-signature" };

  it("refuses a settlement response it cannot read, and charges nothing", async () => {
    const response = await SELF.fetch(
      `${BASE}/api/buy/settlement_attestation?tx_hash=${TX}&payment_response=garbage!!`,
      { headers: buying },
    );
    expect(response.status).toBe(400);
    const body: unknown = await response.json();
    if (!isRecord(body)) throw new Error("no body");
    expect(String(body.error)).toContain("Nothing charged");
    expect(body.input_field).toBe("payment_response");
  });

  it("publishes the input so a client can find it first time", async () => {
    const body: unknown = await (await SELF.fetch(`${BASE}/.well-known/x402.json`)).json();
    if (!isRecord(body) || !Array.isArray(body.resources)) throw new Error("no resources");
    const resource = body.resources.find(
      (entry: unknown) => isRecord(entry) && entry.resourceUrl === `${BASE}/api/buy/settlement_attestation`,
    );
    if (!isRecord(resource) || !isRecord(resource.inputSchema) || !isRecord(resource.inputSchema.properties)) {
      throw new Error("no schema");
    }
    const property = resource.inputSchema.properties["payment_response"];
    expect(isRecord(property)).toBe(true);
    expect(String((property as Record<string, unknown>).description)).toContain("Received, not observed");
  });
});
