import { SELF, env } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { JCS_DUAL_EMIT_DATED, jcsCanonicalize, signJcs } from "@/lib/jcs";
import { verifyMessageSignature } from "@/lib/signing";
import type { Env } from "@/types";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { buildPaymentSignature, decodePaymentRequired } from "./helpers/payment";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * THE DUAL-EMIT (keeper's ruling, 2026-08-18): every artifact minted
 * from today carries a second signature over the RFC 8785 (JCS)
 * canonicalization of the same fields, so tooling built around the
 * receipts drafts can verify our artifacts without knowing our field
 * lists.
 *
 * Two halves to pin. The canonicalizer itself, against the RFC's own
 * semantics — a signing-path serializer that is almost right produces
 * signatures that are exactly worthless. And the money path, end to
 * end — a helper that exists but is not wired mints artifacts that
 * quietly lack the one field this whole build was for.
 */

describe("the RFC 8785 canonicalizer", () => {
  it("sorts keys by UTF-16 code units, which is not code points", () => {
    /*
     * The distinction the RFC's own test data exists to catch: "€"
     * (U+20AC, one code unit) sorts BEFORE "\u{1F600}" (a surrogate
     * pair starting 0xD83D). A code-point sort would order them the
     * other way, produce different bytes, and break against every
     * conformant implementation.
     */
    const canonical = jcsCanonicalize({ "\u{1F600}": 2, "€": 1 });
    expect(canonical).toBe(`{"€":1,"\u{1F600}":2}`);
  });

  it("matches the RFC 8785 number and literal serializations", () => {
    // ES shortest round-trip numbers, JSON literals, no whitespace.
    expect(
      jcsCanonicalize({
        b: 1e30,
        a: 10,
        c: 0.000001,
        d: 1e-7,
        e: true,
        f: null,
        g: "x",
      }),
    ).toBe('{"a":10,"b":1e+30,"c":0.000001,"d":1e-7,"e":true,"f":null,"g":"x"}');
  });

  it("recurses through arrays and nested objects, keeping array order", () => {
    // Sorting applies to object KEYS only; array positions are data.
    expect(jcsCanonicalize({ z: [{ b: 2, a: 1 }, "s"], a: {} })).toBe(
      '{"a":{},"z":[{"a":1,"b":2},"s"]}',
    );
  });

  it("omits undefined object fields, exactly like the house discipline", () => {
    expect(jcsCanonicalize({ b: undefined, a: 1 })).toBe('{"a":1}');
  });

  it("REFUSES a non-finite number instead of signing a quiet null", () => {
    // JSON.stringify would write null where NaN was meant. A signature
    // over an improvised value is a signature over a lie.
    expect(() => jcsCanonicalize({ a: Number.NaN })).toThrow();
    expect(() => jcsCanonicalize({ a: Infinity })).toThrow();
  });

  it("round-trips: the canonical bytes parse back to the same data", () => {
    const value = { z: [1, 2.5, "é"], a: { c: true, b: null } };
    expect(JSON.parse(jcsCanonicalize(value))).toEqual(value);
  });
});

let facilitator: ReturnType<typeof installFacilitatorMock>;

beforeAll(() => {
  facilitator = installFacilitatorMock();
});

async function buy(path: string): Promise<Record<string, any>> {
  const challenge = await SELF.fetch(`${BASE}${path}`);
  expect(challenge.status).toBe(402);
  const accepted = decodePaymentRequired(challenge).accepts[0]!;
  const paid = await SELF.fetch(`${BASE}${path}`, {
    headers: { "PAYMENT-SIGNATURE": buildPaymentSignature(accepted) },
  });
  expect(paid.status).toBe(200);
  return (await paid.json()) as Record<string, any>;
}

describe("every certificate minted from today dual-emits", () => {
  it("the purchase response carries signature_jcs, and it VERIFIES over the JCS bytes", async () => {
    void facilitator;
    const body = await buy("/api/buy/hello");
    const block = body["patron"] ?? body;
    expect(block.signature_jcs, "no signature_jcs on the purchase").toBeTruthy();
    expect(block.signature_jcs_covers).toContain("RFC 8785");

    /*
     * THE CHECK THAT MAKES THIS INTEROP RATHER THAN DECORATION: verify
     * the JCS signature the way an OUTSIDE tool would — from the
     * served certificate alone, no knowledge of CERT_FIELDS. Strip
     * nothing, consult no field list: canonicalize the certificate
     * object as served and expect the signature to cover it.
     */
    const jcsPayload = jcsCanonicalize(block.certificate);
    expect(
      await verifyMessageSignature(
        jcsPayload,
        block.signature_jcs,
        block.public_key,
      ),
      "signature_jcs does not verify over jcs(certificate as served) — an outside JCS tool would reject this artifact",
    ).toBe(true);

    // And the two signatures are genuinely different bytes over
    // different orderings — not one signature served twice.
    expect(block.signature_jcs).not.toBe(block.signature);
  });

  it("/api/verify reports the JCS signature's validity SEPARATELY from the primary's", async () => {
    const body = await buy("/api/buy/small_blessing");
    const block = body["patron"] ?? body;
    const verify = (await (
      await SELF.fetch(`${BASE}/api/verify/${block.certificate.cert_id}`)
    ).json()) as Record<string, any>;

    expect(verify.valid).toBe(true);
    expect(verify.signature_jcs).toBe(block.signature_jcs);
    expect(verify.signature_jcs_valid).toBe(true);
    // The exact bytes, served — same courtesy the primary gets.
    expect(verify.signature_jcs_payload).toBe(
      jcsCanonicalize(verify.certificate),
    );
    expect(verify.signature_jcs_gap).toBeUndefined();
  });

  it("explains an OLD artifact's missing JCS signature as history, not defect", async () => {
    /*
     * Every certificate in a stranger's hands today predates the
     * dual-emit. The verify response has to say why the field is
     * absent, or a reader checking an old artifact against the spec's
     * "every artifact carries signature_jcs" reasonably concludes the
     * artifact is broken.
     */
    const body = await buy("/api/buy/small_blessing");
    const block = body["patron"] ?? body;
    const certId = block.certificate.cert_id as string;
    const key = `cert:${certId}`;
    const stored = (await testEnv.PATRONS.get(key, "json")) as Record<
      string,
      unknown
    >;
    delete stored["signature_jcs"];
    await testEnv.PATRONS.put(key, JSON.stringify(stored));

    const verify = (await (
      await SELF.fetch(`${BASE}/api/verify/${certId}`)
    ).json()) as Record<string, any>;
    expect(verify.valid).toBe(true);
    expect(verify.signature_jcs).toBeNull();
    expect(verify.signature_jcs_covers).toContain(JCS_DUAL_EMIT_DATED);
  });
});

describe("the overlap classes — the artifacts in the receipts race's lane", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("a settlement attestation dual-emits, verifiable from the served fields alone", async () => {
    /*
     * Driven at the service rather than through the paid door: the
     * facilitator mock and a chain stub would fight over global fetch,
     * and the dual-emit lives in observeWithFacts' one signing tail —
     * the same tail every purchase (single and bundle alike) exits
     * through.
     */
    const { observeSettlement } = await import("@/services/attestation");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init?: { body?: string }) => {
        const method = (JSON.parse(init?.body ?? "{}") as { method?: string })
          .method;
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: method === "eth_blockNumber" ? "0x2f00000" : null,
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }),
    );
    const attestation = (await observeSettlement(testEnv, {
      txHash: `0x${"ab".repeat(32)}`,
    })) as unknown as Record<string, any>;
    expect(attestation.signature_jcs).toBeTruthy();

    /*
     * Outside-tool rule again: everything above `signature` is the
     * signed subset, per signature_covers. Reconstruct it without
     * private knowledge — take the served object, drop the signature
     * block fields it names as its own.
     */
    const subset: Record<string, unknown> = { ...attestation };
    delete subset["signature"];
    delete subset["public_key"];
    delete subset["signature_covers"];
    delete subset["signature_jcs"];
    delete subset["signature_jcs_covers"];
    expect(
      await verifyMessageSignature(
        jcsCanonicalize(subset),
        attestation.signature_jcs,
        attestation.public_key,
      ),
    ).toBe(true);
  });
});

describe("signJcs, the helper every mint path shares", () => {
  it("signs the sorted bytes, so field order at the call site cannot matter", async () => {
    const one = await signJcs({ b: 2, a: 1 }, testEnv.SIGNING_KEY);
    const two = await signJcs({ a: 1, b: 2 }, testEnv.SIGNING_KEY);
    // ed25519 is deterministic: same bytes, same key, same signature.
    expect(one).toBe(two);
  });
});
