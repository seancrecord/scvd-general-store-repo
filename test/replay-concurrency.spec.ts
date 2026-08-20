import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import {
  installFacilitatorMock,
  type FacilitatorMockState,
} from "./helpers/facilitator-mock";
import {
  buildPaymentSignature,
  decodePaymentRequired,
} from "./helpers/payment";

const BASE = "https://scvd.store";

/**
 * B7, CLOSED THE B6 WAY — a test, not a rewrite.
 *
 * The known gap: the KV replay guard is read-then-write, so two
 * requests carrying the SAME signed authorization can both pass the
 * "is this nonce spent?" read before either records it. KEEPER_LIST
 * has said since 08-10 that "the chain's nonce is the backstop, so
 * this is resilience, not correctness" — and this file makes that
 * sentence a proven property of our stack instead of a comment. The
 * facilitator mock enforces nonce-once exactly as
 * TransferWithAuthorization does (reverts on reuse), so the race runs
 * against reality's rules.
 *
 * The invariants that make the gap harmless, pinned:
 *   1. One authorization is CHARGED at most once (one settled nonce).
 *   2. At most one distinct artifact is minted for it.
 *   3. A later replay of the same signature mints nothing new.
 */

let mock: FacilitatorMockState;

beforeAll(() => {
  mock = installFacilitatorMock();
});

async function fetchHelloWith(header: string): Promise<{
  status: number;
  body: Record<string, unknown>;
}> {
  const response = await SELF.fetch(`${BASE}/api/buy/hello`, {
    headers: { "PAYMENT-SIGNATURE": header },
  });
  return {
    status: response.status,
    body: (await response.json().catch(() => ({}))) as Record<string, unknown>,
  };
}

function certIdOf(body: Record<string, unknown>): string | null {
  const cert = body["certificate"];
  if (cert && typeof cert === "object") {
    const id = (cert as Record<string, unknown>)["cert_id"];
    return typeof id === "string" ? id : null;
  }
  const id = body["cert_id"];
  return typeof id === "string" ? id : null;
}

describe("the replay guard under concurrency (B7)", () => {
  it("one authorization: one charge, at most one artifact, however racy the client", async () => {
    const challenge = await SELF.fetch(`${BASE}/api/buy/hello`);
    expect(challenge.status).toBe(402);
    const accepted = decodePaymentRequired(challenge).accepts[0]!;
    // ONE signed authorization — one nonce — used by every request below.
    const header = buildPaymentSignature(accepted);

    const noncesBefore = mock.settledNonces.size;
    const [first, second] = await Promise.all([
      fetchHelloWith(header),
      fetchHelloWith(header),
    ]);

    // Invariant 1: the chain-shaped mock settled this nonce exactly once,
    // however many settle ATTEMPTS the race let through.
    expect(mock.settledNonces.size).toBe(noncesBefore + 1);

    // Invariant 2: at most one distinct artifact exists for it. (Both
    // requests MAY report the same certificate — delivering the paid-for
    // goods to a retry is the paid-retry doctrine, not a defect. Two
    // DIFFERENT certificates would be a double mint, and that is the
    // failure this test exists to catch.)
    const certs = new Set(
      [first, second]
        .map((r) => certIdOf(r.body))
        .filter((id): id is string => id !== null),
    );
    expect(certs.size).toBeLessThanOrEqual(1);
    // And somebody got the goods: the sale itself must not be lost to
    // the race.
    expect(certs.size).toBe(1);

    // Invariant 3: a later, sequential replay of the same signature
    // mints nothing new — whichever door refuses it (KV guard or the
    // chain-shaped nonce refusal), the artifact count stays put.
    const replay = await fetchHelloWith(header);
    const replayCert = certIdOf(replay.body);
    if (replayCert !== null) {
      // Served as a replay of the SAME sale, never a new one.
      expect(certs.has(replayCert)).toBe(true);
    }
    expect(mock.settledNonces.size).toBe(noncesBefore + 1);
  });
});
