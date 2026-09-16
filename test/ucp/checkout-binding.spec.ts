import { describe, expect, it } from "vitest";
import {
  settlementConsumptionKey,
  verifyPaymentAgainstTerms,
  type BindingFailure,
} from "@/lib/ucp/checkout/binding";
import { termsDigest, type PaymentTerms } from "@/lib/ucp/checkout/terms";
import { BASE_USDC, POLYGON_USDC } from "@/lib/base-rpc";
import { SOLANA_USDC_MINT } from "@/lib/solana-rpc";
import type { PurchasePayment } from "@/lib/purchase-payment";

const NOW = Date.parse("2026-09-16T12:00:00.000Z");
const PAY_TO = "0x1111111111111111111111111111111111111111";

const TERMS: PaymentTerms = {
  checkout_id: "chk_abc",
  checkout_version: 3,
  network: "eip155:8453",
  asset: BASE_USDC,
  amount_atomic: "5000000",
  pay_to: PAY_TO,
  expires_at: "2026-09-16T12:30:00.000Z",
};

function payment(overrides: Partial<PurchasePayment> = {}): PurchasePayment {
  return {
    version: 1,
    protocol: "x402",
    method: "exact",
    network: TERMS.network,
    asset: TERMS.asset,
    amount_atomic: TERMS.amount_atomic,
    recipient: TERMS.pay_to,
    payer: "0x2222222222222222222222222222222222222222",
    identity: "a".repeat(64),
    proof_digest: "b".repeat(64),
    ...overrides,
  };
}

async function verify(args: {
  payment?: Partial<PurchasePayment>;
  terms?: Partial<PaymentTerms>;
  currentVersion?: number;
  nowMs?: number;
  issuedDigest?: string;
}) {
  const terms = { ...TERMS, ...args.terms };
  return verifyPaymentAgainstTerms({
    payment: payment(args.payment),
    terms,
    issuedDigest: args.issuedDigest ?? (await termsDigest(terms)),
    currentVersion: args.currentVersion ?? terms.checkout_version,
    nowMs: args.nowMs ?? NOW,
  });
}

/**
 * THE FAILURE MATRIX.
 *
 * Every row is a way a payment can fail to satisfy the obligation this
 * store issued. The happy path is one line at the top; the rest of
 * this file is the part that decides whether the store is safe to
 * transact with, and it is table-driven so that adding an attack is
 * adding a row rather than writing a test.
 */
describe("a payment satisfies this exact obligation, or it is named why not", () => {
  it("accepts the payment the store actually quoted", async () => {
    const verdict = await verify({});
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.identity).toBe("a".repeat(64));
  });

  const REJECTIONS: ReadonlyArray<{
    attack: string;
    failure: BindingFailure;
    args: Parameters<typeof verify>[0];
  }> = [
    {
      attack: "right amount, wrong chain",
      failure: "wrong_network",
      args: { payment: { network: "eip155:137" } },
    },
    {
      attack: "right chain, a different chain's USDC contract",
      failure: "wrong_asset",
      args: { payment: { asset: POLYGON_USDC } },
    },
    {
      attack: "a token that merely calls itself USDC",
      failure: "wrong_asset",
      args: { payment: { asset: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" } },
    },
    {
      attack: "an SPL mint offered against an EVM quote",
      failure: "wrong_asset",
      args: { payment: { asset: SOLANA_USDC_MINT } },
    },
    {
      attack: "paid to somebody else",
      failure: "wrong_recipient",
      args: { payment: { recipient: "0x3333333333333333333333333333333333333333" } },
    },
    {
      attack: "one atomic unit short",
      failure: "amount_mismatch",
      args: { payment: { amount_atomic: "4999999" } },
    },
    {
      attack: "one atomic unit over",
      failure: "amount_mismatch",
      args: { payment: { amount_atomic: "5000001" } },
    },
    {
      attack: "generous overpayment, which must not upgrade anything",
      failure: "amount_mismatch",
      args: { payment: { amount_atomic: "50000000" } },
    },
    {
      attack: "another tier's perfectly legitimate price",
      failure: "amount_mismatch",
      // $600 is real money for the generous Collab tier and wrong here.
      args: { payment: { amount_atomic: "600000000" } },
    },
    {
      attack: "nothing at all",
      failure: "amount_mismatch",
      args: { payment: { amount_atomic: "0" } },
    },
    {
      attack: "an amount that is not a number",
      failure: "amount_mismatch",
      args: { payment: { amount_atomic: "5000000.0" } },
    },
    {
      attack: "a signature bound to a withdrawn version of the quote",
      failure: "stale_version",
      args: { currentVersion: 4 },
    },
    {
      attack: "terms this store never issued",
      failure: "terms_digest_mismatch",
      args: { issuedDigest: "c".repeat(64) },
    },
    {
      attack: "arriving after the window closed",
      failure: "expired",
      args: { nowMs: Date.parse("2026-09-16T12:30:00.000Z") },
    },
    {
      attack: "a protocol this checkout does not settle",
      failure: "unsupported_protocol",
      args: { payment: { protocol: "paypal" as never } },
    },
  ];

  for (const row of REJECTIONS) {
    it(`refuses: ${row.attack}`, async () => {
      const verdict = await verify(row.args);
      expect(verdict.ok, row.attack).toBe(false);
      if (!verdict.ok) {
        expect(verdict.failure, row.attack).toBe(row.failure);
        // A refusal a buyer cannot act on is a refusal that costs a
        // support round trip.
        expect(verdict.detail.length).toBeGreaterThan(20);
      }
    });
  }

  it("accepts the last instant before expiry and refuses the first instant after", async () => {
    const at = Date.parse(TERMS.expires_at);
    expect((await verify({ nowMs: at - 1 })).ok).toBe(true);
    expect((await verify({ nowMs: at })).ok).toBe(false);
  });

  it("reads one EVM address however it was cased, on both sides", async () => {
    expect(
      (await verify({ payment: { recipient: PAY_TO.toUpperCase().replace("0X", "0x") } }))
        .ok,
    ).toBe(true);
    expect((await verify({ payment: { asset: BASE_USDC.toUpperCase().replace("0X", "0x") } })).ok).toBe(
      true,
    );
  });

  it("does not case-fold a Solana address, because base58 is case-significant", async () => {
    const solana: Partial<PaymentTerms> = {
      network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
      asset: SOLANA_USDC_MINT,
      pay_to: "11111111111111111111111111111111",
    };
    expect(
      (
        await verify({
          terms: solana,
          payment: {
            network: solana.network,
            asset: SOLANA_USDC_MINT,
            recipient: "11111111111111111111111111111111",
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await verify({
          terms: solana,
          payment: {
            network: solana.network,
            asset: SOLANA_USDC_MINT.toLowerCase(),
            recipient: "11111111111111111111111111111111",
          },
        })
      ).ok,
    ).toBe(false);
  });

  it("checks the version before the digest, so the error says what happened", async () => {
    const verdict = await verify({ currentVersion: 9, issuedDigest: "c".repeat(64) });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.failure).toBe("stale_version");
      expect(verdict.detail).toContain("version 9");
    }
  });
});

/**
 * REPLAY IS REFUSED GLOBALLY, NOT PER CHECKOUT. A key scoped to one
 * checkout would let the same evidence satisfy a second one, which is
 * the entire attack.
 */
describe("settlement evidence is consumable once, storewide", () => {
  it("keys on the chain and the store's own settlement identity", () => {
    const key = settlementConsumptionKey(payment());
    expect(key).toBe(`ucp:settled:eip155:8453:${"a".repeat(64)}`);
    expect(key).not.toContain("chk_");
  });

  it("gives one payment one key whichever checkout presents it", () => {
    expect(settlementConsumptionKey(payment())).toBe(
      settlementConsumptionKey(payment()),
    );
  });

  it("separates the same nonce seen on two different chains", () => {
    expect(settlementConsumptionKey(payment())).not.toBe(
      settlementConsumptionKey(payment({ network: "eip155:137" })),
    );
  });

  it("cannot be spent once as x402 and again as MPP", () => {
    // purchase-payment.ts derives `identity` deliberately WITHOUT the
    // protocol, so the same authorization is the same spend either way.
    expect(settlementConsumptionKey(payment({ protocol: "x402" }))).toBe(
      settlementConsumptionKey(payment({ protocol: "mpp", method: "evm/charge" })),
    );
  });
});
