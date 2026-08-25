import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import {
  buildPaymentSignature,
  decodePaymentRequired,
} from "./helpers/payment";
import { suggestedIdempotencyKey } from "@/lib/idempotency";
import { isRecord } from "@/types";

const BASE = "https://scvd.store";

/**
 * THE CACHE MUST NOT HAND BACK AN ARTIFACT ABOUT SOMETHING ELSE.
 *
 * Found 2026-08-25 by a review pass over the money paths, and
 * measured before it was fixed.
 *
 * The idempotency slot was keyed on (path, payer, hashed key), and the
 * key the store itself SUGGESTS in every 402 body is
 * `scvd-suggested-<item>-<minute>`. Neither carried the query string —
 * and most of this shelf takes its whole input from the query:
 * tx_hash, url, wallet, digest, tag, mandate.
 *
 * So two genuinely different purchases, same item, same payer, same
 * minute, collided. The buyer who asked for `?tag=SECOND` was handed
 * the certificate minted for `?tag=FIRST` — and `tag` is inside
 * CERT_FIELDS, so the ed25519 signature COVERS the wrong value and
 * verifies cleanly against it. A third party checking that artifact
 * gets a valid signature over a fact that was never true for them.
 *
 * On the parameterized doors it is worse than one wrong souvenir: an
 * agent batching settlement attestations over N transactions in a
 * minute receives one attestation about the first, N-1 times.
 *
 * The store publishes the suggested key and tells callers to send it,
 * so this was the store's own advice producing the collision.
 */

beforeAll(() => {
  installFacilitatorMock();
});

async function buyTag(
  tag: string,
  idempotencyKey: string,
): Promise<Record<string, unknown>> {
  const url = `${BASE}/api/buy/graffiti_on_a_train?tag=${tag}`;
  const challenge = await SELF.fetch(url);
  expect(challenge.status).toBe(402);
  const accepted = decodePaymentRequired(challenge).accepts[0]!;
  const response = await SELF.fetch(url, {
    headers: {
      "PAYMENT-SIGNATURE": buildPaymentSignature(accepted),
      "Idempotency-Key": idempotencyKey,
    },
  });
  return (await response.json()) as Record<string, unknown>;
}

function certOf(body: Record<string, unknown>): Record<string, unknown> {
  const cert = body["certificate"];
  return isRecord(cert) ? cert : body;
}

describe("the idempotency slot is scoped to what was actually asked for", () => {
  it("does not serve one purchase's signed artifact to a different purchase", async () => {
    // The store's OWN suggested key: same item, same minute, so the
    // two requests differ only in the argument that decides the goods.
    const key = suggestedIdempotencyKey("graffiti_on_a_train");

    const first = await buyTag("FIRST", key);
    const second = await buyTag("SECOND", key);

    const firstCert = certOf(first);
    const secondCert = certOf(second);

    expect(firstCert["tag"]).toBe("FIRST");
    expect(
      secondCert["tag"],
      "the second buyer was handed a signed artifact about the first buyer's tag",
    ).toBe("SECOND");
    expect(
      secondCert["cert_id"],
      "two different purchases share one certificate id",
    ).not.toBe(firstCert["cert_id"]);
    expect(second["idempotent_replay"]).not.toBe(true);
  });

  it("still replays a genuine retry — the same request, twice", async () => {
    // The mechanism has to keep doing its job: an identical URL with an
    // identical key is a retry loop, not a new purchase, and must not
    // charge twice.
    const key = suggestedIdempotencyKey("graffiti_on_a_train");
    const first = await buyTag("SAME", key);
    const again = await buyTag("SAME", key);
    expect(certOf(again)["cert_id"]).toBe(certOf(first)["cert_id"]);
  });
});

/**
 * THE DELIMITERS ARE NOT DATA — found 2026-08-25 by a review pass over
 * the fix above, hours after it shipped.
 *
 * The first version of idempotencyScope interpolated keys and values
 * raw: `${k}=${v}` joined on "&". So `=` and `&` INSIDE a decoded
 * value were indistinguishable from structure, and two different
 * query strings canonicalized to one string.
 *
 * That is not a theoretical collision. Same item, same payer, same
 * minute, same store-suggested key — one cache slot, and the second
 * caller collects an ed25519-signed artifact naming the wrong
 * subject. Precisely the defect the scope was added to close, back
 * through a hole in the closure.
 */
describe("the scope cannot be forged through its own delimiters", () => {
  it("keeps two different query strings in two different slots", async () => {
    const { idempotencyScope } = await import("@/lib/idempotency");
    const structured = await idempotencyScope(
      "/api/buy/graffiti_on_a_train",
      new URLSearchParams("tag=one&z=two"),
    );
    // One parameter whose VALUE happens to contain the delimiters.
    const injected = await idempotencyScope(
      "/api/buy/graffiti_on_a_train",
      new URLSearchParams([["tag", "one&z=two"]]),
    );
    expect(
      injected,
      "a value carrying & and = collides with real structure",
    ).not.toBe(structured);
  });

  it("is stable under parameter order, which is the property it needs", async () => {
    const { idempotencyScope } = await import("@/lib/idempotency");
    const forwards = await idempotencyScope(
      "/api/buy/x",
      new URLSearchParams("a=1&b=2"),
    );
    const backwards = await idempotencyScope(
      "/api/buy/x",
      new URLSearchParams("b=2&a=1"),
    );
    expect(forwards).toBe(backwards);
  });
});
