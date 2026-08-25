import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock, TEST_PAYER } from "./helpers/facilitator-mock";
import { buildPaymentSignature, decodePaymentRequired } from "./helpers/payment";
import {
  signedOffersForChallenge,
  verifyOwnJws,
  withReceiptHeader,
} from "@/lib/offer-receipt";
import type { Env } from "@/types";

const BASE = "https://scvd.store";

/**
 * READ THE PAYLOAD THE WAY THE SPEC TELLS A VERIFIER TO.
 *
 * These tests used to read `offer.payload.*` straight off the envelope,
 * which is how they came to defend a defect: the spec makes `payload`
 * EIP-712-only and says for JWS it "MUST be omitted (the JWS compact
 * string already contains the payload)", and for JWS "clients extract
 * the payload by base64url-decoding the JWS payload component". Reading
 * the object was easier and wrong. Decoding the JWS is what a
 * conformant verifier does, so the assertions now exercise the same
 * path a stranger's client would.
 */
function payloadOf(jws: string): Record<string, unknown> {
  const body = jws.split(".")[1];
  if (!body) throw new Error("not a compact JWS");
  const padded =
    body.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (body.length % 4)) % 4);
  return JSON.parse(atob(padded)) as Record<string, unknown>;
}

/**
 * THE x402 SIGNED OFFERS & RECEIPTS EXTENSION — built from the
 * normative spec fetched in full, after a confident summary of it
 * turned out to carry three field-level errors (`offerType` for
 * `scheme`, a missing required `asset`, `txHash` for `transaction`).
 * These tests pin the spec's exact field names so a paraphrase can
 * never again be the source of truth.
 *
 * And the standing rule of this gate, tested rather than promised:
 * the extension is fail-open. The till worked before it existed and
 * must work identically if every signature it makes starts throwing.
 */
describe("a 402 carries signed offers, per the spec's wire format", () => {
  beforeAll(() => {
    installFacilitatorMock();
  });

  async function challengeBody(): Promise<Record<string, unknown>> {
    const response = await SELF.fetch(`${BASE}/api/buy/hello`);
    expect(response.status).toBe(402);
    return (await response.json()) as Record<string, unknown>;
  }

  it("places them at extensions['offer-receipt'].info.offers, nowhere else", async () => {
    const body = await challengeBody();
    const extensions = body["extensions"] as Record<string, unknown>;
    expect(extensions, "the 402 body has no extensions field").toBeTruthy();
    const info = (extensions["offer-receipt"] as { info?: { offers?: unknown[] } })
      ?.info;
    expect(info?.offers?.length ?? 0).toBeGreaterThan(0);
  });

  it("signs one offer per accepts tier, tied back by acceptIndex", async () => {
    // A pay-what-it-deserves shelf quotes several amounts; an offer
    // that names none of them commits to nothing. Every tier gets its
    // own signed commitment, pointing at the tier it commits to.
    // accepts live in the PAYMENT-REQUIRED header, not the prose body —
    // the same fact the implementation's first cut got wrong.
    const response = await SELF.fetch(`${BASE}/api/buy/hello`);
    const accepts = decodePaymentRequired(response).accepts;
    const body = (await response.json()) as Record<string, unknown>;
    const offers = (
      ((body["extensions"] as Record<string, unknown>)["offer-receipt"]) as unknown as {
        info: { offers: { acceptIndex: number; signature: string }[] };
      }
    ).info.offers;
    expect(offers.length).toBe(accepts.length);
    for (const offer of offers) {
      expect(payloadOf(offer.signature)["amount"]).toBe(
        accepts[offer.acceptIndex]?.amount,
      );
    }
  });

  it("keeps acceptIndex pointing at the right tier when one is skipped", async () => {
    /*
     * THE HAZARD THE PARALLEL SIGNING CREATED, held down before it
     * could happen.
     *
     * The signing loop was serial and pushed as it went, so a skipped
     * entry simply produced no offer. Signing them in one wave means
     * mapping — and a map that drops entries AFTERWARDS renumbers
     * everything past the first skip. An offer whose acceptIndex
     * points at a different tier is a signed commitment to an amount
     * the buyer was never quoted, which is worse than no offer.
     *
     * So this drives signedOffersForChallenge directly with an
     * unsignable entry in the MIDDLE, where a renumbering bug would
     * show, and checks each offer against the tier it names.
     */
    const accepts = [
      {
        scheme: "exact",
        network: "eip155:8453",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x1111111111111111111111111111111111111111",
        amount: "10000",
      },
      // Missing payTo: unsignable, and deliberately not last.
      {
        scheme: "exact",
        network: "eip155:8453",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        amount: "20000",
      },
      {
        scheme: "exact",
        network: "eip155:8453",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x1111111111111111111111111111111111111111",
        amount: "30000",
      },
    ];
    const signed = await signedOffersForChallenge(
      env as unknown as Env,
      `${BASE}/api/buy/hello`,
      accepts,
      Math.floor(Date.now() / 1000),
    );
    const offers = (
      signed as unknown as {
        "offer-receipt": {
          info: {
            offers: { acceptIndex: number; signature: string }[];
          };
        };
      }
    )["offer-receipt"].info.offers;

    // The hole is skipped, not filled...
    expect(offers.length).toBe(2);
    // ...and every surviving offer still names its OWN tier.
    for (const offer of offers) {
      expect(
        payloadOf(offer.signature)["amount"],
        `acceptIndex ${offer.acceptIndex} points at the wrong tier`,
      ).toBe(accepts[offer.acceptIndex]?.amount);
    }
    expect(offers.map((offer) => offer.acceptIndex)).toEqual([0, 2]);
  });

  it("carries the spec's exact §4.2 payload, version 1 included", async () => {
    const body = await challengeBody();
    const offer = (
      ((body["extensions"] as Record<string, unknown>)["offer-receipt"]) as unknown as {
        info: { offers: { format: string; signature: string }[] };
      }
    ).info.offers[0]!;
    expect(offer.format).toBe("jws");
    // The exact required set. `scheme` not `offerType`, and `asset`
    // present — the two paraphrase errors a compliant verifier would
    // have rejected us over.
    for (const field of [
      "version",
      "resourceUrl",
      "scheme",
      "network",
      "asset",
      "payTo",
      "amount",
      "validUntil",
    ]) {
      expect(
        payloadOf(offer.signature)[field],
        `offer payload lacks ${field}`,
      ).toBeDefined();
    }
    expect(payloadOf(offer.signature)["version"]).toBe(1);
    expect(payloadOf(offer.signature)["resourceUrl"]).toBe(
      `${BASE}/api/buy/hello`,
    );
  });

  it("signs with EdDSA under our did:web kid, and the JWS verifies", async () => {
    const body = await challengeBody();
    const offer = (
      ((body["extensions"] as Record<string, unknown>)["offer-receipt"]) as unknown as {
        info: { offers: { signature: string }[] };
      }
    ).info.offers[0]!;
    const [headerPart] = offer.signature.split(".");
    const header = JSON.parse(
      atob(headerPart!.replace(/-/g, "+").replace(/_/g, "/")),
    ) as { alg: string; kid: string };
    expect(header.alg).toBe("EdDSA");
    /**
     * #key-2, NOT #key-1, and not because of an off-by-one: the kid
     * names the KEY, and this store's current key is its second — the
     * first was retired 2026-07-31. A slot-named #key-1 was here for
     * an hour; the keeper asked how it behaved across rotation, and
     * the answer was that every receipt signed today would resolve to
     * tomorrow's key and fail. Derived from the registry now, so the
     * next rotation mints #key-3 and this kid stays pointing at this
     * key forever.
     */
    expect(header.kid).toBe("did:web:scvd.store#key-2");
    // Verified with an independent reconstruction of the signing
    // input, against the same key every certificate carries — one
    // identity, checkable three ways.
    const checked = await verifyOwnJws(env as Env, offer.signature);
    expect(checked.valid).toBe(true);
    expect(checked.payload?.["amount"]).toBe(
      payloadOf(offer.signature)["amount"],
    );
  });
});

describe("the JWS envelope omits what the spec forbids", () => {
  beforeAll(() => {
    installFacilitatorMock();
  });

  /**
   * THE DEFECT THIS HOLDS DOWN, found 2026-08-25 by reading the spec
   * rather than the implementation. Every offer we issued from launch
   * until that date carried BOTH `signature` (a compact JWS, payload
   * inside) and `payload` (the same object again, in the clear). The
   * spec's envelope table makes payload EIP-712-only and says of JWS:
   * "`payload` MUST be omitted (the JWS compact string already
   * contains the payload)". Nine forbidden copies per challenge, on a
   * published surface, from the store that sells conformance audits.
   *
   * The tests that should have caught it were reading `offer.payload`
   * to make their assertions, so they required the violation to pass.
   * A guard that depends on the defect is not a guard.
   */
  it("no offer carries payload beside a jws signature", async () => {
    const response = await SELF.fetch(`${BASE}/api/buy/certificate_of_patronage`);
    const body = (await response.json()) as Record<string, unknown>;
    const offers = (
      ((body["extensions"] as Record<string, unknown>)["offer-receipt"]) as unknown as {
        info: { offers: Record<string, unknown>[] };
      }
    ).info.offers;
    // A tiered item, so this walks nine envelopes rather than three.
    expect(offers.length).toBeGreaterThan(1);
    for (const offer of offers) {
      expect(offer["format"]).toBe("jws");
      expect(
        Object.hasOwn(offer, "payload"),
        "a jws offer carries payload — the spec says MUST be omitted",
      ).toBe(false);
      // And the payload is still recoverable, which is why omitting it
      // costs a verifier nothing.
      expect(payloadOf(offer["signature"] as string)["version"]).toBe(1);
    }
  });

  it("the receipt omits it too — same MUST, same sentence in the spec", async () => {
    const url = `${BASE}/api/buy/hello`;
    const challenge = await SELF.fetch(url);
    const accepted = decodePaymentRequired(challenge).accepts[0]!;
    const settled = await SELF.fetch(url, {
      headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(accepted) },
    });
    const decoded = JSON.parse(
      atob(settled.headers.get("PAYMENT-RESPONSE")!),
    ) as Record<string, unknown>;
    const receipt = (
      (decoded["extensions"] as Record<string, unknown>)[
        "offer-receipt"
      ] as unknown as { info: { receipt: Record<string, unknown> } }
    ).info.receipt;
    expect(receipt["format"]).toBe("jws");
    expect(
      Object.hasOwn(receipt, "payload"),
      "the jws receipt carries payload — the spec says MUST be omitted",
    ).toBe(false);
    expect(payloadOf(receipt["signature"] as string)["version"]).toBe(1);
  });
});

describe("a settlement carries a signed receipt in PAYMENT-RESPONSE", () => {
  beforeAll(() => {
    installFacilitatorMock();
  });

  async function settle(): Promise<Response> {
    const url = `${BASE}/api/buy/hello`;
    const challenge = await SELF.fetch(url);
    const accepted = decodePaymentRequired(challenge).accepts[0];
    if (!accepted) {
      throw new Error("no tier offered");
    }
    return SELF.fetch(url, {
      headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(accepted) },
    });
  }

  it("rides inside the settlement header at info.receipt, spec-exact", async () => {
    const response = await settle();
    expect(response.status).toBe(200);
    const header = response.headers.get("PAYMENT-RESPONSE");
    expect(header, "the settlement header vanished").toBeTruthy();
    const decoded = JSON.parse(atob(header!)) as {
      extensions?: {
        "offer-receipt"?: { info: { receipt: { signature: string } } };
      };
    };
    const receipt = decoded.extensions?.["offer-receipt"]?.info.receipt;
    expect(receipt, "no receipt in the settlement response").toBeTruthy();
    for (const field of ["version", "network", "resourceUrl", "payer", "issuedAt"]) {
      expect(
        payloadOf(receipt!.signature)[field],
        `receipt lacks ${field}`,
      ).toBeDefined();
    }
    expect(payloadOf(receipt!.signature)["version"]).toBe(1);
    // `transaction`, not `txHash` — and named because this store
    // already publishes settlement_tx on the certificate, so the
    // privacy option the spec leaves open was decided days ago.
    expect(payloadOf(receipt!.signature)["payer"]).toBe(TEST_PAYER);
  });

  it("does not disturb what the facilitator put in the header", async () => {
    // The one place this extension touches bytes a client already
    // parses. Whatever the facilitator said must still be there,
    // exactly — a receipt is worthless if attaching it broke the
    // proof of payment it decorates.
    const response = await settle();
    const decoded = JSON.parse(
      atob(response.headers.get("PAYMENT-RESPONSE")!),
    ) as Record<string, unknown>;
    expect(decoded["success"]).toBe(true);
    const receipt = (decoded["extensions"] as Record<string, unknown>)[
      "offer-receipt"
    ] as unknown as { info: { receipt: { signature: string } } };
    const checked = await verifyOwnJws(env as Env, receipt.info.receipt.signature);
    expect(checked.valid).toBe(true);
  });
});

describe("the extension is fail-open, proven rather than promised", () => {
  it("passes headers through untouched when there is nothing to attest", async () => {
    // No payer: a receipt naming nobody proves nothing, so none is
    // issued and the facilitator's bytes come back byte-identical.
    const original = { "PAYMENT-RESPONSE": btoa(JSON.stringify({ success: true })) };
    const out = await withReceiptHeader(env as Env, original, {
      resourceUrl: `${BASE}/api/buy/hello`,
      network: "eip155:8453",
      nowSeconds: 1_700_000_000,
    });
    expect(out).toEqual(original);
  });

  it("returns the original headers when the header is unparseable", async () => {
    const original = { "PAYMENT-RESPONSE": "%%%not-base64%%%" };
    const out = await withReceiptHeader(env as Env, original, {
      resourceUrl: `${BASE}/api/buy/hello`,
      payer: TEST_PAYER,
      network: "eip155:8453",
      nowSeconds: 1_700_000_000,
    });
    expect(out).toEqual(original);
  });

  it("never blocks the sale: settlement succeeds and goods arrive", async () => {
    installFacilitatorMock();
    const url = `${BASE}/api/buy/hello`;
    const challenge = await SELF.fetch(url);
    const accepted = decodePaymentRequired(challenge).accepts[0]!;
    const response = await SELF.fetch(url, {
      headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(accepted) },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { certificate?: { cert_id: string } };
    expect(body.certificate?.cert_id).toBeTruthy();
  });
});
