import { Challenge, PaymentRequest } from "mppx";
import { expect } from "vitest";

/** Authenticate every byte before excluding only the per-issuance nonce and its HMAC. */
export function stableChallengeHeader(header: string | null, secretKey: string): string | null {
  if (header === null) return null;
  const challenges = Challenge.fromHeadersList(new Headers({ "WWW-Authenticate": header }));
  expect(challenges.length).toBeGreaterThan(0);
  expect(challenges.map(challenge => Challenge.serialize(challenge)).join(", ")).toBe(header);
  return JSON.stringify(challenges.map(challenge => {
    expect(Challenge.verify(challenge, { secretKey })).toBe(true);
    expect(challenge.opaque).toBeDefined();
    const { _mppx_nonce: nonce, ...meta } = PaymentRequest.deserialize(challenge.opaque!) as Record<string, unknown>;
    expect(nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(atob((nonce as string).replace(/-/g, "+").replace(/_/g, "/") + "=")).toHaveLength(32);
    const { id: _id, opaque: _opaque, meta: _meta, ...terms } = challenge;
    return { ...terms, meta };
  }));
}
