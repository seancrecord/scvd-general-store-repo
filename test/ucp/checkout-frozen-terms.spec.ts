import { env } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import {
  UcpPaymentRefused,
  UcpSettlementEvidenceUnavailable,
  createUcpX402Adapter,
} from "@/lib/ucp/checkout/adapter";
import {
  NoSuchRail,
  frozenRequirements,
  sameRequirements,
} from "@/lib/ucp/checkout/requirements";
import { BASE_USDC } from "@/lib/base-rpc";
import { BASE_NETWORK } from "@/lib/payment-networks";
import { SIGNING_WINDOW_SECONDS, getPaymentStack } from "@/lib/payments";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/** A well-formed EIP-3009 authorization payload, as a buyer would sign one. */
function credential(overrides: Record<string, unknown> = {}) {
  return {
    x402Version: 2,
    payload: {
      signature: `0x${"1".repeat(130)}`,
      authorization: {
        from: "0x2222222222222222222222222222222222222222",
        to: "0x1111111111111111111111111111111111111111",
        value: "5000000",
        validAfter: "0",
        validBefore: "99999999999",
        nonce: `0x${"a".repeat(64)}`,
      },
    },
    ...overrides,
  };
}

const ACCEPTS = () =>
  vi.fn(async () => ({
    isValid: true,
    payer: "0x2222222222222222222222222222222222222222",
  }));

/**
 * THE FROZEN-TERMS INVARIANT.
 *
 * Once a checkout is quoted, Complete may supply exactly one thing: an
 * authorization for the terms already quoted. It may not influence any
 * economically meaningful term, and it may not cause those terms to be
 * recomputed from today's shelf.
 */
describe("the requirements a checkout commits to are built once, from the store's own accepts", () => {
  it("produces the same bytes the 402 door would quote for that rail", () => {
    const terms = frozenRequirements(testEnv, BASE_NETWORK, "5000000");
    expect(terms.scheme).toBe("exact");
    expect(terms.network).toBe(BASE_NETWORK);
    expect(terms.asset).toBe(BASE_USDC);
    expect(terms.amount).toBe("5000000");
    expect(terms.maxTimeoutSeconds).toBe(SIGNING_WINDOW_SECONDS);
    // The EIP-712 domain an EVM rail needs, carried rather than guessed.
    expect(terms.extra).toMatchObject({ name: "USD Coin", version: "2" });
  });

  it("refuses a rail this store does not settle on, instead of answering on another", () => {
    expect(() => frozenRequirements(testEnv, "eip155:1", "5000000")).toThrow(NoSuchRail);
  });

  it("refuses an unpayable amount", () => {
    for (const amount of ["0", "-1", "5.0", "", "1e6"]) {
      expect(() => frozenRequirements(testEnv, BASE_NETWORK, amount), amount).toThrow();
    }
  });

  it("compares every field a settlement decision rests on", () => {
    const a = frozenRequirements(testEnv, BASE_NETWORK, "5000000");
    expect(sameRequirements(a, { ...a })).toBe(true);
    const changes: Partial<PaymentRequirements>[] = [
      { amount: "5000001" },
      { asset: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" },
      { payTo: "0x3333333333333333333333333333333333333333" },
      { network: "eip155:137" as PaymentRequirements["network"] },
      { scheme: "upto" },
      { maxTimeoutSeconds: 1 },
      { extra: { name: "USDC", version: "2" } },
    ];
    for (const change of changes) {
      expect(sameRequirements(a, { ...a, ...change }), JSON.stringify(change)).toBe(false);
    }
  });
});

describe("Complete cannot influence any term the checkout already quoted", () => {
  const quoted = () => frozenRequirements(testEnv, BASE_NETWORK, "5000000");

  it("verifies against the frozen terms, whatever the credential claims it was signed against", async () => {
    const verify = ACCEPTS();
    const adapter = createUcpX402Adapter({ requirements: quoted(), verify });
    await adapter.validate(credential());
    const [, used] = verify.mock.calls[0] as unknown as [PaymentPayload, PaymentRequirements];
    expect(sameRequirements(used, quoted())).toBe(true);
    // And the payload handed over carries the store's terms in `accepted`.
    const [payload] = verify.mock.calls[0] as unknown as [PaymentPayload];
    expect(sameRequirements(payload.accepted, quoted())).toBe(true);
  });

  const SMUGGLED: ReadonlyArray<{ field: string; accepted: Record<string, unknown> }> = [
    { field: "amount", accepted: { amount: "1" } },
    { field: "amount", accepted: { amount: "50000000" } },
    { field: "asset", accepted: { asset: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" } },
    { field: "payTo", accepted: { payTo: "0x3333333333333333333333333333333333333333" } },
    { field: "network", accepted: { network: "eip155:137" } },
    { field: "scheme", accepted: { scheme: "upto" } },
  ];

  for (const row of SMUGGLED) {
    it(`refuses a credential signed against a different ${row.field}`, async () => {
      const verify = ACCEPTS();
      const adapter = createUcpX402Adapter({ requirements: quoted(), verify });
      await expect(
        adapter.validate(credential({ accepted: { ...quoted(), ...row.accepted } })),
      ).rejects.toThrow(UcpPaymentRefused);
      // Refused BEFORE the facilitator is troubled: the disagreement is
      // ours to see, and asking would imply it might be acceptable.
      expect(verify).not.toHaveBeenCalled();
    });
  }

  it("accepts a credential whose accepted block agrees, EVM casing aside", async () => {
    const verify = ACCEPTS();
    const adapter = createUcpX402Adapter({ requirements: quoted(), verify });
    const terms = quoted();
    await adapter.validate(
      credential({
        accepted: {
          ...terms,
          asset: terms.asset.toUpperCase().replace("0X", "0x"),
          payTo: terms.payTo.toUpperCase().replace("0X", "0x"),
        },
      }),
    );
    expect(verify).toHaveBeenCalledOnce();
  });

  it("cannot have its terms mutated after construction", async () => {
    const terms = quoted();
    const verify = ACCEPTS();
    const adapter = createUcpX402Adapter({ requirements: terms, verify });
    // The caller mutates the object it handed in.
    terms.amount = "1";
    terms.payTo = "0x3333333333333333333333333333333333333333";
    await adapter.validate(credential());
    const [, used] = verify.mock.calls[0] as unknown as [PaymentPayload, PaymentRequirements];
    expect(used.amount).toBe("5000000");
    expect(used.payTo).toBe("0x1111111111111111111111111111111111111111");
    expect(adapter.terms().amount).toBe("5000000");
  });

  it("hands back terms a caller cannot mutate either", () => {
    const adapter = createUcpX402Adapter({ requirements: quoted(), verify: ACCEPTS() });
    const handed = adapter.terms();
    handed.amount = "1";
    expect(adapter.terms().amount).toBe("5000000");
  });

  it("refuses to build on terms that are not payable at all", () => {
    for (const change of [
      { scheme: "upto" },
      { amount: "0" },
      { amount: "abc" },
      { asset: "" },
      { payTo: "" },
    ]) {
      expect(
        () => createUcpX402Adapter({ requirements: { ...quoted(), ...change } as PaymentRequirements, verify: ACCEPTS() }),
        JSON.stringify(change),
      ).toThrow();
    }
  });

  it("refuses a credential that is not an x402 payload", async () => {
    const adapter = createUcpX402Adapter({ requirements: quoted(), verify: ACCEPTS() });
    for (const bad of [null, undefined, {}, { payload: "nope" }, "signature"]) {
      await expect(adapter.validate(bad), JSON.stringify(bad)).rejects.toThrow(
        UcpPaymentRefused,
      );
    }
  });

  it("refuses when the facilitator refuses, and says what it said", async () => {
    const adapter = createUcpX402Adapter({
      requirements: quoted(),
      verify: async () => ({ isValid: false, invalidReason: "insufficient_funds" }),
    });
    await expect(adapter.validate(credential())).rejects.toThrow(/insufficient_funds/);
  });

  it("refuses a verification that comes back valid with no payer", async () => {
    // A payer is the thing the settlement identity is derived from; a
    // valid-but-anonymous verdict cannot admit a purchase.
    const adapter = createUcpX402Adapter({
      requirements: quoted(),
      verify: async () => ({ isValid: true }),
    });
    await expect(adapter.validate(credential())).rejects.toThrow(UcpPaymentRefused);
  });

  it("derives the same settlement identity the buy door would", async () => {
    const adapter = createUcpX402Adapter({ requirements: quoted(), verify: ACCEPTS() });
    const { payment } = await adapter.validate(credential());
    expect(payment.protocol).toBe("x402");
    expect(payment.amount_atomic).toBe("5000000");
    expect(payment.network).toBe(BASE_NETWORK);
    expect(payment.identity).toMatch(/^[0-9a-f]{64}$/);
    expect(payment.authorization?.nonce).toBe(`0x${"a".repeat(64)}`);
    // Verified payer, lowercased on EVM the way the store has always done.
    expect(payment.payer).toBe("0x2222222222222222222222222222222222222222");
  });
});

describe("settlement evidence is checked against the frozen terms", () => {
  const quoted = () => frozenRequirements(testEnv, BASE_NETWORK, "5000000");
  const payer = "0x2222222222222222222222222222222222222222";

  async function settleWith(reply: Record<string, unknown>) {
    const adapter = createUcpX402Adapter({ requirements: quoted(), verify: ACCEPTS() });
    const { payload } = await adapter.validate(credential());
    return adapter.settle(payload, async () => reply as never, payer);
  }

  it("passes through an explicit refusal rather than turning it into uncertainty", async () => {
    const result = await settleWith({ success: false, errorReason: "declined" });
    expect(result.success).toBe(false);
  });

  it("accepts a success that carries matching evidence", async () => {
    const result = await settleWith({
      success: true,
      transaction: `0x${"f".repeat(64)}`,
      network: BASE_NETWORK,
      payer,
    });
    expect(result.success).toBe(true);
  });

  it("treats a success without evidence as uncertainty, never as payment", async () => {
    for (const reply of [
      { success: true },
      { success: true, transaction: "" },
      { success: true, transaction: `0x${"f".repeat(64)}`, network: "eip155:137" },
      {
        success: true,
        transaction: `0x${"f".repeat(64)}`,
        network: BASE_NETWORK,
        payer: "0x9999999999999999999999999999999999999999",
      },
    ]) {
      await expect(settleWith(reply), JSON.stringify(reply)).rejects.toThrow(
        UcpSettlementEvidenceUnavailable,
      );
    }
  });
});

/**
 * THE SEAM IS REAL, not a shape the tests invented. The adapter's
 * verifier callback has a production source: the same facilitator the
 * HTTP gate uses, now reachable without synthesizing a request.
 */
describe("the production verifier comes from the store's own facilitator", () => {
  it("exposes verify and settle on the payment stack", () => {
    const stack = getPaymentStack(testEnv);
    expect(typeof stack.facilitator.verify).toBe("function");
    expect(typeof stack.facilitator.settle).toBe("function");
    // And the gate's own entry point is untouched beside it.
    expect(typeof stack.httpServer.processHTTPRequest).toBe("function");
  });

  it("is the one the adapter's callback is shaped for", () => {
    const stack = getPaymentStack(testEnv);
    const adapter = createUcpX402Adapter({
      requirements: frozenRequirements(testEnv, BASE_NETWORK, "5000000"),
      // Assignable without a wrapper: that is the whole claim.
      verify: (payload, requirements) => stack.facilitator.verify(payload, requirements),
    });
    expect(adapter.terms().amount).toBe("5000000");
  });
});
