import { TEST_PAYER, TEST_TRANSACTION } from "./facilitator-mock";

/**
 * Builders for x402 v2 payment headers, mirroring what a real client
 * (e.g. @x402/fetch) would produce from our 402 challenge.
 */

export interface ChallengeRequirement {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra?: Record<string, unknown>;
}

export interface PaymentRequiredChallenge {
  x402Version: number;
  error?: string;
  resource: { url: string; description: string };
  accepts: ChallengeRequirement[];
  /** Declared extensions (e.g. bazaar discovery), echoed by real clients. */
  extensions?: Record<string, unknown>;
}

export function decodePaymentRequired(
  response: Response,
): PaymentRequiredChallenge {
  const header = response.headers.get("PAYMENT-REQUIRED");
  if (!header) {
    throw new Error("Missing PAYMENT-REQUIRED header on 402 response");
  }
  return JSON.parse(atob(header)) as PaymentRequiredChallenge;
}

function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Signs (in spirit) one of the offered requirements. Verify is mocked.
 * Nonces are unique per call, as a real EIP-3009 client's would be;
 * pass an explicit nonce to simulate a replay.
 */
export function buildPaymentSignature(
  accepted: ChallengeRequirement,
  nonce: string = randomNonce(),
): string {
  const payload = {
    x402Version: 2,
    accepted,
    payload: {
      signature: `0x${"cd".repeat(65)}`,
      authorization: {
        from: TEST_PAYER,
        to: accepted.payTo,
        value: accepted.amount,
        validAfter: "0",
        validBefore: "99999999999",
        nonce,
      },
    },
  };
  return btoa(JSON.stringify(payload));
}

/**
 * A PendingPayment for tests that call `fulfillPurchase` directly.
 *
 * Rule 9 as amended 2026-08-10 hands fulfilment the AUTHORIZATION
 * rather than a settled payment, so it can do its expensive work
 * before any money moves. A direct caller has no gate behind it to
 * provide the settle, so this stands in: it "settles" instantly and
 * records that it was asked, which is the fact most of these tests
 * actually care about.
 */
export function pendingPaymentStub(
  overrides: {
    paidUsdc?: number;
    tipUsdc?: number;
    payer?: string;
    network?: string;
    transaction?: string;
  } = {},
): {
  paidUsdc: number;
  tipUsdc: number;
  payer?: string;
  network?: string;
  settleCalls: number;
  settle: () => Promise<Record<string, unknown>>;
} {
  const stub = {
    paidUsdc: overrides.paidUsdc ?? 0.5,
    tipUsdc: overrides.tipUsdc ?? 0,
    ...(overrides.payer ? { payer: overrides.payer } : {}),
    ...(overrides.network ? { network: overrides.network } : {}),
    settleCalls: 0,
    settle: async () => {
      stub.settleCalls += 1;
      return {
        paidUsdc: stub.paidUsdc,
        tipUsdc: stub.tipUsdc,
        transaction: overrides.transaction ?? TEST_TRANSACTION,
        settleHeaders: {},
        ...(overrides.payer ? { payer: overrides.payer } : {}),
        ...(overrides.network ? { network: overrides.network } : {}),
      };
    },
  };
  return stub;
}
