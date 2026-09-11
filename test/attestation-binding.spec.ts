import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  AUTHORIZATION_USED_TOPIC,
  BASE_EVM,
  TRANSFER_TOPIC,
} from "@/lib/base-rpc";
import type { RpcReceipt } from "@/lib/base-rpc";
import { verifyMessageSignature } from "@/lib/signing";
import {
  BINDING_CLASS_ALIASES,
  SETTLEMENT_ATTESTATION_BATTERY,
  observeWithFacts,
  readBinding,
} from "@/services/attestation";
import { ARTIFACT_CLASSES } from "@/store/attestation-spec";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE BINDING CLASS (2026-09-11). A transaction-hash observation says
 * "settled", and by hash "settled twice"; it never said "the settlement
 * of THAT authorization" in so many words, even when the desk had read
 * the nonce off the chain and folded the answer into the status. Now
 * the artifact states what it ties the transaction to, states what was
 * asked, and states the seam: a nonce binds one authorization, never
 * one request. Old artifacts predate the field; the battery is how a
 * reader tells "predates" from "missing".
 */
const PAYER = "0x1111111111111111111111111111111111111111";
const PAYEE = "0x2222222222222222222222222222222222222222";
const TX = `0x${"ab".repeat(32)}`;
const NONCE = `0x${"cd".repeat(32)}`;

function topicFor(address: string): string {
  return `0x000000000000000000000000${address.slice(2)}`;
}

function settledReceipt(nonce: string | null = NONCE): RpcReceipt {
  return {
    status: "0x1",
    blockNumber: "0x64",
    logs: [
      {
        address: BASE_EVM.usdc,
        topics: [TRANSFER_TOPIC, topicFor(PAYER), topicFor(PAYEE)],
        data: "0xfa0",
      },
      ...(nonce
        ? [
            {
              address: BASE_EVM.usdc,
              topics: [AUTHORIZATION_USED_TOPIC, topicFor(PAYER), nonce],
              data: "0x",
            },
          ]
        : []),
    ],
  };
}

const HEAD = 100 + 40;

describe("what the artifact says it is bound to", () => {
  it("names the battery on every observation", async () => {
    const signed = await observeWithFacts(testEnv, { txHash: TX }, settledReceipt(), HEAD);
    expect(signed.battery).toBe(SETTLEMENT_ATTESTATION_BATTERY);
    expect(SETTLEMENT_ATTESTATION_BATTERY).toMatch(/^settlement-attestation-v\d+$/);
  });

  it("asked without a nonce: none, and says nothing was asked", async () => {
    const signed = await observeWithFacts(testEnv, { txHash: TX }, settledReceipt(), HEAD);
    expect(signed.status).toBe("SETTLED");
    expect(signed.binding.class).toBe("none");
    expect(signed.binding.asked).toBe("none");
    // Unasked is not unbound: the reading says how to bind.
    expect(signed.binding.reading).toContain("No authorization nonce was asked about");
    expect(signed.binding.reading).toContain("PAYMENT-SIGNATURE");
  });

  it("asked with the nonce the chain burned: authorization_nonce, with the seam stated", async () => {
    const signed = await observeWithFacts(
      testEnv,
      { txHash: TX, nonce: NONCE },
      settledReceipt(),
      HEAD,
    );
    expect(signed.status).toBe("SETTLED");
    expect(signed.binding.class).toBe("authorization_nonce");
    expect(signed.binding.asked).toBe("authorization_nonce");
    // One authorization, never one request — on the artifact, not in a doc.
    expect(signed.binding.reading).toContain("one authorization, not to one request");
    expect(signed.binding.reading).toContain("not observed here");
  });

  it("asked with a nonce the chain did not burn: none, asked, and the status agrees", async () => {
    const signed = await observeWithFacts(
      testEnv,
      { txHash: TX, nonce: `0x${"ef".repeat(32)}` },
      settledReceipt(),
      HEAD,
    );
    expect(signed.status).toBe("INSUFFICIENT_MATCH");
    expect(signed.binding.class).toBe("none");
    expect(signed.binding.asked).toBe("authorization_nonce");
    expect(signed.binding.reading).toContain("does not appear");
  });

  it("asked with a nonce and no transaction to read: none, and says nothing about later", async () => {
    const signed = await observeWithFacts(testEnv, { txHash: TX, nonce: NONCE }, null, HEAD);
    expect(signed.status).toBe("NOT_FOUND");
    expect(signed.binding.class).toBe("none");
    expect(signed.binding.asked).toBe("authorization_nonce");
    expect(signed.binding.reading).toContain("nothing about later");
  });

  it("asked with a nonce on a reverted transaction: none, no authorization used", async () => {
    const reverted: RpcReceipt = { status: "0x0", blockNumber: "0x64", logs: [] };
    const signed = await observeWithFacts(testEnv, { txHash: TX, nonce: NONCE }, reverted, HEAD);
    expect(signed.status).toBe("REVERTED");
    expect(signed.binding.class).toBe("none");
    expect(signed.binding.reading).toContain("reverted");
  });

  it("puts battery and binding inside the signed bytes, both disciplines", async () => {
    const signed = await observeWithFacts(
      testEnv,
      { txHash: TX, nonce: NONCE },
      settledReceipt(),
      HEAD,
    );
    const {
      signature,
      public_key,
      signature_covers: _c,
      signature_jcs: _j,
      signature_jcs_covers: _jc,
      ...observation
    } = signed;
    expect(Object.keys(observation)).toContain("battery");
    expect(Object.keys(observation)).toContain("binding");
    // The order served is the order signed; a re-serialization verifies.
    expect(
      await verifyMessageSignature(JSON.stringify(observation), signature, public_key),
    ).toBe(true);
    // And the scope points the reader at the field.
    expect(signed.scope).toContain("binding field");
  });
});

describe("how a reader takes the field when it is not there", () => {
  it("no battery: predates binding classes — silent, not unbound", () => {
    const read = readBinding({ status: "SETTLED", query: { txHash: TX } });
    expect(read.kind).toBe("predates");
    if (read.kind === "predates") {
      expect(read.note).toContain("predates");
      expect(read.note).toContain('not "unbound"');
    }
  });

  it("battery without binding: a defect, not an old artifact", () => {
    const read = readBinding({ battery: SETTLEMENT_ATTESTATION_BATTERY });
    expect(read.kind).toBe("defect");
    if (read.kind === "defect") expect(read.note).toContain("defective");
  });

  it("battery with a malformed binding: still a defect", () => {
    const read = readBinding({
      battery: SETTLEMENT_ATTESTATION_BATTERY,
      binding: { class: "bound", asked: "none", reading: "" },
    });
    expect(read.kind).toBe("defect");
  });

  it("battery with the binding: declared, verbatim", async () => {
    const signed = await observeWithFacts(testEnv, { txHash: TX }, settledReceipt(), HEAD);
    const read = readBinding(signed);
    expect(read.kind).toBe("declared");
    if (read.kind === "declared") expect(read.binding).toEqual(signed.binding);
  });
});

describe("the vocabulary is declared, not invented under pressure", () => {
  it("names every class in the alias table, including the reserved one", () => {
    expect(Object.keys(BINDING_CLASS_ALIASES).sort()).toEqual(
      ["authorization_nonce", "input_commitment", "none"],
    );
    // The reserved class points at the field it will map to.
    expect(BINDING_CLASS_ALIASES.input_commitment.join(" ")).toContain("inputCommitment");
  });

  it("the page that states what is signed names battery, binding and the absence rule", () => {
    const entry = ARTIFACT_CLASSES.find((c) => c.id === "settlement_attestation");
    expect(entry).toBeTruthy();
    expect(entry!.signs).toContain("battery");
    expect(entry!.signs).toContain("binding");
    expect(entry!.signs).toContain("never as unbound");
    expect(entry!.does_not_prove).toContain("not one 402 challenge");
  });
});
