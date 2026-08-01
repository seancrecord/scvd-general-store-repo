import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import {
  buildPaymentSignature,
  decodePaymentRequired,
} from "./helpers/payment";
import { isRecord } from "@/types";

const BASE = "https://scvd.store";
let mock: ReturnType<typeof installFacilitatorMock>;

/**
 * WHO IS ALLOWED TO COLLECT A CACHED PURCHASE.
 *
 * The idempotency cache holds a buyer's actual goods — a certificate,
 * the thing they paid for — keyed by (path, payer, hashed key). The
 * question this file exists to pin down is what a caller must PROVE to
 * be handed one back.
 *
 * Until 2026-08-02 the answer was: nothing cryptographic. The lookup
 * ran at the top of the gate off the payer address read straight out
 * of the base64 PAYMENT-SIGNATURE header, which at that point is
 * decoded and never checked — anyone can write any `authorization.from`
 * they like into it. So a caller who ASSERTED a buyer's address (public
 * on Base) and knew their Idempotency-Key got the buyer's goods. The
 * key being a caller-held secret was the entire defence, and it rested
 * on a value that can leak through a log or a predictable generator.
 *
 * Now the lookup happens AFTER the facilitator has verified, off the
 * payload it returned, so the payer is an account that actually SIGNED.
 * A replay takes the private key, not knowledge of an address.
 */

beforeAll(() => {
  mock = installFacilitatorMock();
});

async function buy(
  idempotencyKey?: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const url = `${BASE}/api/buy/hello`;
  const challenge = await SELF.fetch(url);
  expect(challenge.status).toBe(402);
  const accepted = decodePaymentRequired(challenge).accepts[0]!;
  const response = await SELF.fetch(url, {
    headers: {
      "PAYMENT-SIGNATURE": buildPaymentSignature(accepted),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
  });
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

function certIdOf(body: Record<string, unknown>): string {
  const cert = body["certificate"];
  return isRecord(cert) ? String(cert["cert_id"]) : String(body["cert_id"]);
}

describe("a cached purchase is not collectable without a valid signature", () => {
  it("refuses the replay when the signature does not verify", async () => {
    const key = "auth-required-for-replay-key-1";

    // A real buyer buys, and their goods land in the cache.
    const real = await buy(key);
    expect(real.status).toBe(200);
    const cert = certIdOf(real.body);
    expect(cert).toMatch(/^cert_/);

    /**
     * Now the same key and the same claimed payer arrive with a
     * signature the facilitator rejects. This is the shape of the
     * attack the old ordering allowed: assert the address, present the
     * key, collect the goods. It must now come back a refusal.
     */
    mock.verifyShouldFail = true;
    try {
      const forged = await buy(key);
      expect(forged.status).toBe(402);
      // And emphatically NOT the buyer's certificate.
      expect(JSON.stringify(forged.body)).not.toContain(cert);
    } finally {
      mock.verifyShouldFail = false;
    }
  });

  it("still replays for the genuine buyer, which is the whole point", async () => {
    // The protection must not have cost the feature it protects: a
    // looping agent signs a fresh authorization every pass and should
    // still get its original sale back, uncharged.
    const key = "genuine-loop-still-replays-01";
    const first = await buy(key);
    expect(first.status).toBe(200);

    const second = await buy(key);
    expect(second.status).toBe(200);
    expect(second.body["idempotent_replay"]).toBeDefined();
    expect(certIdOf(second.body)).toBe(certIdOf(first.body));
  });

  it("a rejected signature leaves nothing cached to collect later", async () => {
    const key = "rejected-caches-nothing-key-1";
    mock.verifyShouldFail = true;
    try {
      const refused = await buy(key);
      expect(refused.status).toBe(402);
    } finally {
      mock.verifyShouldFail = false;
    }
    // The same key now buys for real: the refusal cached no body, so
    // this is a fresh sale rather than a replay of a failure.
    const paid = await buy(key);
    expect(paid.status).toBe(200);
    expect(paid.body["idempotent_replay"]).toBeUndefined();
  });
});
