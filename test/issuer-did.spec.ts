import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { CERT_FIELDS, canonicalizeCertificate, cachedPublicKeyHex } from "@/lib/signing";
import { didKeyFromEd25519Hex, issuerDid } from "@/lib/did-key";
import { decodeBase58 } from "@/lib/base58";
import type { Certificate, Env } from "@/types";
import { installMultiPurchaseFacilitatorMock } from "./helpers/facilitator-mock";
import { buildPaymentSignature, decodePaymentRequired } from "./helpers/payment";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * THE ISSUER, SIGNED (ruling R1, 2026-09-21): a certificate names who
 * issued it inside the bytes the signature covers; the name is an
 * identity and never a URL; the DID document carries the same key as
 * a did:key so the name survives a domain move; and a certificate
 * minted before the field existed verifies exactly as it did.
 */

beforeAll(() => {
  installMultiPurchaseFacilitatorMock();
});

describe("the issuer inside the signed bytes", () => {
  it("is the last signed field and never a URL", () => {
    expect(CERT_FIELDS[CERT_FIELDS.length - 1]).toBe("issuer");
    expect(issuerDid(BASE)).toBe("did:web:scvd.store");
    expect(issuerDid(BASE)).not.toContain("http");
  });

  it("rides every new purchase certificate, inside signed_payload, and the verify URL is derived from it", async () => {
    const url = `${BASE}/api/buy/hello?agent_name=issuer-spec`;
    const challenge = decodePaymentRequired(await SELF.fetch(url));
    const paid = await SELF.fetch(url, { headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(challenge.accepts[0]!), Accept: "application/json" } });
    expect(paid.status, await paid.clone().text()).toBe(200);
    const purchase = (await paid.json()) as { certificate: Certificate; signed_payload: string; verify_url: string };
    expect(purchase.certificate.issuer).toBe("did:web:scvd.store");
    expect(purchase.signed_payload).toContain('"issuer":"did:web:scvd.store"');
    expect(purchase.signed_payload).not.toContain("verify_url");
    expect(purchase.verify_url).toBe(`${BASE}/api/verify/${purchase.certificate.cert_id}`);
    const verified = (await (await SELF.fetch(purchase.verify_url, { headers: { Accept: "application/json" } })).json()) as { valid: boolean; certificate: Certificate };
    expect(verified.valid).toBe(true);
    expect(verified.certificate.issuer).toBe("did:web:scvd.store");
    const html = await (await SELF.fetch(purchase.verify_url, { headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0" } })).text();
    expect(html).toContain("did:web:scvd.store");
  });

  it("leaves a certificate minted before the field existed exactly as it was", () => {
    const before = { cert_id: "cert_old", item: "hello", patron_number: 1, date: "2026-08-01T00:00:00.000Z" } as Certificate;
    expect(canonicalizeCertificate(before)).not.toContain("issuer");
    expect(canonicalizeCertificate({ ...before, issuer: "did:web:scvd.store" })).toContain('"issuer":"did:web:scvd.store"');
  });

  it("names the same key as a did:key in the DID document, beside the did:web", async () => {
    const doc = (await (await SELF.fetch(`${BASE}/.well-known/did.json`)).json()) as { id: string; alsoKnownAs: string[]; scvd: { issuer_on_certificates: string } };
    expect(doc.id).toBe("did:web:scvd.store");
    expect(doc.scvd.issuer_on_certificates).toBe(doc.id);
    const [didKey] = doc.alsoKnownAs;
    expect(didKey).toMatch(/^did:key:z[1-9A-HJ-NP-Za-km-z]+$/);
    const publicKey = await cachedPublicKeyHex(testEnv.SIGNING_KEY);
    expect(didKey).toBe(didKeyFromEd25519Hex(publicKey));
    // The did:key decodes to the multicodec prefix and the very key that signs.
    const bytes = decodeBase58(didKey!.slice("did:key:z".length))!;
    expect(Array.from(bytes.slice(0, 2))).toEqual([0xed, 0x01]);
    expect(Array.from(bytes.slice(2)).map((b) => b.toString(16).padStart(2, "0")).join("")).toBe(publicKey);
  });

  it("refuses to spell a did:key for anything but a 32-byte key", () => {
    expect(() => didKeyFromEd25519Hex("abcd")).toThrow();
  });
});
