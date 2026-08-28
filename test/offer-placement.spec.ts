import { describe, expect, it } from "vitest";
import { runChecks } from "@/services/preflight";
import { OFFERS_READ_BASIS, marketAggregates, offerFacts } from "@/services/market";

/**
 * BOTH PLACEMENTS, HELD BY BEHAVIOR (the instrument audit,
 * 2026-08-28 — the market desk's caught defect, pinned shut).
 *
 * The offer-receipt convention places signed offers in the 402 BODY
 * (lib/offer-receipt.ts); the header splice is our own till's
 * additional placement. The battery and the market desk read the
 * header only, then asserted door-level absence — in the free
 * report, the $5 audit, the $5 watch's signed passes, and the
 * census aggregate — against issuers who placed offers exactly where
 * the convention says. These tests feed real Responses, never call
 * sites: a body-placing door must be seen, absence may be asserted
 * only over the placements actually read, and a caller that
 * withholds the body must say so instead of claiming both.
 */

const b64url = (s: string): string =>
  btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Structurally valid JWS — three base64url segments, JSON header
 * and payload. Parse-level only; signatures are the desk's job. */
const VALID_JWS = `${b64url(JSON.stringify({ alg: "EdDSA", kid: "did:web:door.example#key-1" }))}.${b64url(JSON.stringify({ version: 1 }))}.${b64url("signature-bytes")}`;

const OFFER_EXT = {
  "offer-receipt": { info: { offers: [{ signature: VALID_JWS }] } },
};

function challenge(extensions?: Record<string, unknown>): Record<string, unknown> {
  return {
    x402Version: 2,
    accepts: [
      {
        scheme: "exact",
        network: "eip155:8453",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x0000000000000000000000000000000000000001",
        amount: "1000",
      },
    ],
    ...(extensions ? { extensions } : {}),
  };
}

function door(
  headerExtensions: Record<string, unknown> | undefined,
  body: string,
): { response: Response; body: string } {
  return {
    response: new Response(body, {
      status: 402,
      headers: { "PAYMENT-REQUIRED": btoa(JSON.stringify(challenge(headerExtensions))) },
    }),
    body,
  };
}

const signedOffers = (checks: { name: string; ok: boolean; detail: string }[]) =>
  checks.find((check) => check.name === "signed-offers");
const noOffers = (advisories: { name: string; detail: string }[]) =>
  advisories.find((advisory) => advisory.name === "no-signed-offers");

describe("the signed-offers check reads both placements", () => {
  it("sees offers placed ONLY in the 402 body — the convention's first placement", () => {
    const { response, body } = door(
      undefined,
      JSON.stringify(challenge(OFFER_EXT)),
    );
    const { checks, advisories } = runChecks(response, false, body);
    const check = signedOffers(checks);
    expect(check, "a body-placing door must be seen").toBeTruthy();
    expect(check!.ok).toBe(true);
    expect(check!.detail).toContain("the 402 body");
    expect(noOffers(advisories)).toBeUndefined();
  });

  it("the header wins when both placements carry offers — the launch check's law", () => {
    const { response, body } = door(OFFER_EXT, JSON.stringify(challenge(OFFER_EXT)));
    const { checks } = runChecks(response, false, body);
    expect(signedOffers(checks)!.detail).toContain("PAYMENT-REQUIRED header");
  });

  it("broken body-placed offers fail the check rather than passing as absent", () => {
    const { response, body } = door(
      undefined,
      JSON.stringify(
        challenge({
          "offer-receipt": { info: { offers: [{ signature: "not-a-jws" }] } },
        }),
      ),
    );
    const { checks } = runChecks(response, false, body);
    const check = signedOffers(checks);
    expect(check!.ok).toBe(false);
    expect(check!.detail).toContain("the 402 body");
  });

  it("absence is asserted over BOTH placements when both were read", () => {
    const { response, body } = door(undefined, JSON.stringify(challenge()));
    const { advisories } = runChecks(response, false, body);
    const advisory = noOffers(advisories);
    expect(advisory).toBeTruthy();
    expect(advisory!.detail).toContain("both placements read");
  });

  it("a caller that withholds the body gets an advisory that says so — never a claim about a placement nobody read", () => {
    const { response } = door(undefined, JSON.stringify(challenge()));
    const { advisories } = runChecks(response, false);
    const advisory = noOffers(advisories);
    expect(advisory).toBeTruthy();
    expect(advisory!.detail).toContain("no body");
    expect(advisory!.detail).not.toContain("both placements read");
  });
});

describe("the market desk's offer facts read both placements", () => {
  it("a body-only challenge still contributes rails and prices", () => {
    const body = JSON.stringify(challenge());
    const response = new Response(body, { status: 402 });
    const facts = offerFacts(response, body);
    expect(facts).toBeTruthy();
    expect(facts!.networks).toEqual(["eip155:8453"]);
    expect(facts!.min_usdc).toBe(0.001);
  });

  it("the header wins when both parse — one law with the launch check", () => {
    const headerOnly = challenge();
    (headerOnly["accepts"] as Record<string, unknown>[])[0]!["amount"] = "2000";
    const response = new Response(JSON.stringify(challenge()), {
      status: 402,
      headers: { "PAYMENT-REQUIRED": btoa(JSON.stringify(headerOnly)) },
    });
    const facts = offerFacts(response, JSON.stringify(challenge()));
    expect(facts!.min_usdc).toBe(0.002);
  });

  it("no challenge in either placement is still null — nothing invented", () => {
    const response = new Response("plain text", { status: 402 });
    expect(offerFacts(response, "plain text")).toBeNull();
  });

  it("the aggregate carries the basis marker, so post-fix weeks can never silently mix with header-only history", () => {
    const aggregates = marketAggregates([]);
    expect(aggregates.signed_offers.basis).toBe(OFFERS_READ_BASIS);
  });
});
