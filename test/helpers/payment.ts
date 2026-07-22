import { TEST_PAYER } from "./facilitator-mock";

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

/** Signs (in spirit) one of the offered requirements. Verify is mocked. */
export function buildPaymentSignature(accepted: ChallengeRequirement): string {
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
        nonce: `0x${"01".repeat(32)}`,
      },
    },
  };
  return btoa(JSON.stringify(payload));
}
