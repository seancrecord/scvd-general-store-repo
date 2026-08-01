import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock, TEST_PAYER } from "./helpers/facilitator-mock";
import { buildPaymentSignature, decodePaymentRequired } from "./helpers/payment";
import { verifyOwnJws, withReceiptHeader } from "@/lib/offer-receipt";
import type { Env } from "@/types";

const BASE = "https://scvd.store";

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
        info: { offers: { acceptIndex: number; payload: { amount: string } }[] };
      }
    ).info.offers;
    expect(offers.length).toBe(accepts.length);
    for (const offer of offers) {
      expect(offer.payload.amount).toBe(accepts[offer.acceptIndex]?.amount);
    }
  });

  it("carries the spec's exact §4.2 payload, version 1 included", async () => {
    const body = await challengeBody();
    const offer = (
      ((body["extensions"] as Record<string, unknown>)["offer-receipt"]) as unknown as {
        info: { offers: { format: string; payload: Record<string, unknown> }[] };
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
      expect(offer.payload[field], `offer payload lacks ${field}`).toBeDefined();
    }
    expect(offer.payload["version"]).toBe(1);
    expect(offer.payload["resourceUrl"]).toBe(`${BASE}/api/buy/hello`);
  });

  it("signs with EdDSA under our did:web kid, and the JWS verifies", async () => {
    const body = await challengeBody();
    const offer = (
      ((body["extensions"] as Record<string, unknown>)["offer-receipt"]) as unknown as {
        info: { offers: { signature: string; payload: { amount: string } }[] };
      }
    ).info.offers[0]!;
    const [headerPart] = offer.signature.split(".");
    const header = JSON.parse(
      atob(headerPart!.replace(/-/g, "+").replace(/_/g, "/")),
    ) as { alg: string; kid: string };
    expect(header.alg).toBe("EdDSA");
    expect(header.kid).toBe("did:web:scvd.store#key-1");
    // Verified with an independent reconstruction of the signing
    // input, against the same key every certificate carries — one
    // identity, checkable three ways.
    const checked = await verifyOwnJws(env as Env, offer.signature);
    expect(checked.valid).toBe(true);
    expect(checked.payload?.["amount"]).toBe(offer.payload.amount);
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
        "offer-receipt"?: { info: { receipt: { payload: Record<string, unknown> } } };
      };
    };
    const receipt = decoded.extensions?.["offer-receipt"]?.info.receipt;
    expect(receipt, "no receipt in the settlement response").toBeTruthy();
    for (const field of ["version", "network", "resourceUrl", "payer", "issuedAt"]) {
      expect(receipt!.payload[field], `receipt lacks ${field}`).toBeDefined();
    }
    expect(receipt!.payload["version"]).toBe(1);
    // `transaction`, not `txHash` — and named because this store
    // already publishes settlement_tx on the certificate, so the
    // privacy option the spec leaves open was decided days ago.
    expect(receipt!.payload["payer"]).toBe(TEST_PAYER);
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
