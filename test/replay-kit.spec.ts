import { SELF, env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";

const BASE = "https://scvd.store";
const testEnv = env as never as import("@/types").Env;

/**
 * THE REPLAY KIT (2026-09-12): one paid call as an integration test.
 * Asked for from outside after the quote went into the signature: a
 * paid call id, the JWS offer, settlement proof, response hash, and
 * the refusal code when scope is wrong, in one document an agent can
 * replay. These pin that every part is derived from the record and
 * the catalog, that the offer's five terms hash to the certificate's
 * signed quote, that the kit's own signature checks against the same
 * key, and that the kit says plainly what it does not retain.
 */

afterEach(() => vi.unstubAllGlobals());

async function buyHello() {
  const { installMultiPurchaseFacilitatorMock } = await import("./helpers/facilitator-mock");
  const { decodePaymentRequired, buildPaymentSignature } = await import("./helpers/payment");
  installMultiPurchaseFacilitatorMock();
  const url = `${BASE}/api/buy/hello`;
  const offer = decodePaymentRequired(await SELF.fetch(url)).accepts[0]!;
  const header = buildPaymentSignature(offer);
  const paid = await SELF.fetch(url, { headers: { "PAYMENT-SIGNATURE": header } });
  expect(paid.status).toBe(200);
  const body = (await paid.json()) as {
    certificate: import("@/types").Certificate;
    replay_url: string;
    verify_url: string;
  };
  return { body, offer, header };
}

type Kit = import("@/services/replay-kit").SignedReplayKit;

function base64UrlOf(text: string): string {
  // UTF-8 bytes first: the kit's prose carries characters btoa rejects.
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

describe("the replay kit stands together at /api/replay/{cert_id}", () => {
  it("assembles offer, settlement, response hash and refusal from one paid call", async () => {
    const { body, offer } = await buyHello();
    const { quotedTerms, hashQuotedTerms } = await import("@/discovery/receipt-surface");
    const { verifyOwnJws } = await import("@/lib/offer-receipt");
    const { sha256Hex } = await import("@/lib/idempotency");

    expect(body.replay_url).toBe(`${BASE}/api/replay/${body.certificate.cert_id}`);
    const response = await SELF.fetch(body.replay_url);
    expect(response.status).toBe(200);
    const kit = (await response.json()) as Kit;

    // The call.
    expect(kit.artifact_class).toBe("replay_kit");
    expect(kit.call.cert_id).toBe(body.certificate.cert_id);
    expect(kit.call.item).toBe("hello");

    // The offer: five terms recovered by hash, an offer signed over them.
    const expectedQuote = await hashQuotedTerms(quotedTerms(offer)!);
    expect(kit.offer.quote).toBe(expectedQuote);
    expect(kit.offer.accepted_terms).toEqual(quotedTerms(offer));
    expect(kit.offer.recovered_from).toMatch(/^catalog:/);
    expect(kit.offer.jws).toBeTruthy();
    const checked = await verifyOwnJws(testEnv, kit.offer.jws!);
    expect(checked.valid).toBe(true);
    const payload = checked.payload!;
    expect(payload.version).toBe(1);
    expect(payload.resourceUrl).toBe(`${BASE}/api/buy/hello`);
    expect(await hashQuotedTerms(quotedTerms(payload)!)).toBe(expectedQuote);
    expect(kit.offer.jws_note).toContain("not retained");
    expect(kit.offer.kid).toMatch(/^did:web:scvd\.store#key-\d+$/);

    // The settlement: the certificate's transaction, explorer, payer.
    expect(kit.settlement.state).toBe("settled_on_chain");
    expect(kit.settlement.transaction).toBe(body.certificate.settlement_tx);
    expect(kit.settlement.explorer).toContain(body.certificate.settlement_tx!);
    expect(kit.settlement.payer).toBe(body.certificate.payer);
    expect(kit.settlement.standing.delivery_audit.state).toBe("closed");

    // The response: the signed bytes and their hash, re-derived.
    expect(kit.response.form).toBe("current");
    expect(kit.response.artifact_hash).toBe(await sha256Hex(kit.response.signed_payload));
    expect(kit.response.signed_payload).toContain(`"quote":"${expectedQuote}"`);
    const { verifyMessageSignature } = await import("@/lib/signing");
    expect(await verifyMessageSignature(kit.response.signed_payload, kit.response.signature, kit.response.public_key)).toBe(true);

    // The refusal: the same body the door serves, derived not typed.
    const { inputMismatchRefusal } = await import("@/services/purchase-intent");
    expect(kit.refusal.wrong_scope.code).toBe("purchase_input_mismatch");
    expect(kit.refusal.wrong_scope.charged_again).toBe(false);
    expect(kit.refusal.wrong_scope.error).toBe(inputMismatchRefusal({}).error);
    expect(kit.refusal.wrong_scope.recovery).toMatchObject({ status_tool: "check_purchase" });
    expect(String((kit.refusal.wrong_scope.recovery as { status_token: string }).status_token)).toContain("never published");

    // The steps, and the honest list of what is not here.
    expect(kit.replay.length).toBeGreaterThanOrEqual(6);
    expect(kit.not_retained.some((line) => line.includes("PAYMENT-SIGNATURE"))).toBe(true);
    expect(kit.cite).toContain(kit.replay_url);
  });

  it("signs the kit itself, detached, over its RFC 8785 form, under the offer kid", async () => {
    const { body } = await buyHello();
    const kit = (await (await SELF.fetch(body.replay_url)).json()) as Kit;
    const { jcsCanonicalize } = await import("@/lib/jcs");
    const { verifyOwnJws } = await import("@/lib/offer-receipt");
    const { kit_signature, ...unsigned } = kit;
    expect(kit_signature.format).toBe("jws-detached");
    const [header, empty, signature] = kit_signature.signature.split(".");
    expect(empty).toBe("");
    const compact = `${header}.${base64UrlOf(jcsCanonicalize(unsigned))}.${signature}`;
    expect((await verifyOwnJws(testEnv, compact)).valid).toBe(true);
    // A kit with one byte changed no longer verifies.
    const tampered = { ...unsigned, settlement: { ...unsigned.settlement, paid_usdc: 999 } };
    const forged = `${header}.${base64UrlOf(jcsCanonicalize(tampered))}.${signature}`;
    expect((await verifyOwnJws(testEnv, forged)).valid).toBe(false);
  });

  it("names the terms as not_observed on a certificate minted before the quote existed, and signs no offer", async () => {
    const { buildReplayKit } = await import("@/services/replay-kit");
    const { signCertificate } = await import("@/lib/signing");
    const certificate: import("@/types").Certificate = {
      cert_id: "cert_prequote", item: "hello", patron_number: 7, date: "2026-08-01T00:00:00.000Z",
      paid_usdc: 0.5, asset: "USDC", network: "eip155:8453", payer: "0x2222222222222222222222222222222222222222",
      settlement_tx: `0x${"cd".repeat(32)}`,
    };
    const { signature, publicKey } = await signCertificate(certificate, testEnv.SIGNING_KEY);
    const kit = await buildReplayKit(testEnv, { certificate, signature, public_key: publicKey });
    expect(kit.offer.quote).toBeNull();
    expect(kit.offer.accepted_terms).toBeNull();
    expect(kit.offer.recovered_from).toMatch(/^not_observed/);
    expect(kit.offer.jws).toBeNull();
    expect(kit.settlement.standing.order_of_operations).toBe("settled_then_delivered");
    expect(kit.response.form).toBe("current");
  });

  it("refuses the URL template without a verdict and answers 404 for an id it never issued", async () => {
    const template = await SELF.fetch(`${BASE}/api/replay/{cert_id}`);
    expect(template.status).toBe(400);
    expect(JSON.stringify(await template.json())).not.toContain('"valid"');
    const missing = await SELF.fetch(`${BASE}/api/replay/cert_neverissued`);
    expect(missing.status).toBe(404);
    expect(JSON.stringify(await missing.json())).not.toContain('"valid"');
  });

  it("is declared on /attestation as its own signed class, and linked from the receipt page", async () => {
    const { ARTIFACT_CLASSES } = await import("@/store/attestation-spec");
    const cls = ARTIFACT_CLASSES.find((entry) => entry.id === "replay_kit");
    expect(cls?.verify_url).toBe("/api/replay/{cert_id}");
    expect(cls?.does_not_prove).toContain("not retained");
    const { body } = await buyHello();
    const json = (await (await SELF.fetch(body.verify_url)).json()) as { replay_url: string };
    expect(json.replay_url).toBe(body.replay_url);
    const html = await (await SELF.fetch(body.verify_url, { headers: { Accept: "text/html" } })).text();
    expect(html).toContain(`/api/replay/${body.certificate.cert_id}`);
  });
});
