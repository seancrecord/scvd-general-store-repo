import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";

/**
 * THE ISSUER THIS DESK COULD NEVER RESOLVE WAS ITS OWN OPERATOR.
 *
 * CV's second live finding, 2026-08-03, sitting directly behind the
 * redirect-value bug fixed that same morning: once did:web fetches
 * actually went out, resolving OUR OWN identifier died as a 522 —
 * Cloudflare refuses a Worker's subrequest to its own hostname — while
 * the identical URL answered 200 in 60ms from anywhere else on earth.
 * Two bugs, one symptom, the first masking the second. The happy path
 * everyone actually walks ("check the offer this store just handed
 * me") could not ever have worked over the network, on any deploy.
 *
 * THIS FILE IS THAT REPRO, IN-PROCESS AND EXACT: pull a genuine live
 * 402 off the buy door, feed the real JWS to the conformance endpoint
 * with default settings, and require `conforms`. The fix serves our
 * own two well-known documents from the same builders the public
 * routes use — so these tests never touch the network, in the test
 * runner or in production, which is the point.
 */

const BASE = "https://scvd.store";

async function liveOfferJws(item = "small_blessing"): Promise<string> {
  const challenge = await SELF.fetch(`${BASE}/api/buy/${item}`);
  expect(challenge.status).toBe(402);
  const body = (await challenge.json()) as Record<string, unknown>;
  const offers = (
    (body["extensions"] as Record<string, unknown>)["offer-receipt"] as {
      info: { offers: { signature: string }[] };
    }
  ).info.offers;
  expect(offers.length).toBeGreaterThan(0);
  return offers[0]!.signature;
}

async function check(
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await SELF.fetch(`${BASE}/api/conformance/v1`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  expect(response.status).toBe(200);
  return (await response.json()) as Record<string, unknown>;
}

describe("CV's repro: our own live offer, default settings", () => {
  beforeAll(() => {
    installFacilitatorMock();
  });

  it("conforms — the happy path everyone actually walks finally works", async () => {
    const verdict = await check({ artifact: await liveOfferJws() });
    expect(verdict["verdict"]).toBe("conforms");
    expect(verdict["key_resolution"]).toBe("did:web");
    expect(verdict["live"]).toBe(true);
    const checks = verdict["checks"] as { name: string; ok: boolean }[];
    expect(checks.every((entry) => entry.ok)).toBe(true);
  });

  it("says HOW it resolved, and what that cannot attest (rule 5b)", async () => {
    const verdict = await check({ artifact: await liveOfferJws() });
    const note = verdict["self_resolution"];
    expect(typeof note).toBe("string");
    // The mechanism, named: read in-process, not fetched.
    expect(note).toContain("/.well-known/did.json");
    expect(note).toContain("not over the network");
    // The limit, named: this cannot prove public reachability.
    expect(note).toContain("cannot attest");
  });

  it("an offline check gets no self_resolution field — absence is the claim", async () => {
    // Supplying public_key_hex skips resolution entirely, so nothing
    // was self-served and the field must be absent rather than
    // present-but-empty. Uses the published test vectors, whose kid is
    // deliberately on our host with the TEST key — the exact shape
    // that would confuse a desk that conflated "our host" with "our
    // key".
    const vectors = await SELF.fetch(
      `${BASE}/.well-known/conformance/offer-receipt-vectors.json`,
    );
    const parsed = (await vectors.json()) as {
      signing: { public_key_hex: string };
      valid: { name: string; jws: string }[];
    };
    const valid = parsed.valid.find((entry) => entry.name === "offer_valid");
    expect(valid).toBeTruthy();
    const verdict = await check({
      artifact: valid!.jws,
      public_key_hex: parsed.signing.public_key_hex,
    });
    expect(verdict["verdict"]).toBe("conforms");
    expect("self_resolution" in verdict).toBe(false);
  });

  it("check_anchor against ourselves reads the log in-process too", async () => {
    const verdict = await check({
      artifact: await liveOfferJws(),
      check_anchor: true,
    });
    const anchor = verdict["anchored_key_history"] as Record<string, unknown>;
    expect(anchor).toBeTruthy();
    // The one wrong answer: a 522 dressed up as "no anchor log".
    // Fresh test KV has no anchors, so `available` is true with an
    // empty log — the read WORKED. Reason must never mention an HTTP
    // failure.
    expect(anchor["available"]).toBe(true);
    expect(String(anchor["reason"] ?? "")).not.toMatch(/HTTP 5\d\d|unreachable/);
  });

  it("did:web on our host with a PATH answers a legible 404, not an edge timeout", async () => {
    // did:web:scvd.store:foo → https://scvd.store/foo/did.json. We
    // serve no such document; before the fix this fetch would go out
    // and die as a 522 wearing an "issuer unreachable" costume.
    const offer = await liveOfferJws();
    const [, payloadPart, sigPart] = offer.split(".");
    const forgedHeader = btoa(
      JSON.stringify({ alg: "EdDSA", kid: "did:web:scvd.store:foo#key-1" }),
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const verdict = await check({
      artifact: `${forgedHeader}.${payloadPart}.${sigPart}`,
    });
    expect(verdict["verdict"]).not.toBe("conforms");
    const resolution = (verdict["checks"] as { name: string; detail?: string }[]).find(
      (entry) => entry.name === "key-resolution",
    );
    expect(resolution?.detail ?? "").toContain("404");
    expect(resolution?.detail ?? "").not.toContain("522");
  });

  it("the self-served DID document is byte-identical to the public route's", async () => {
    // One producer, two consumers, no copy to drift: the whole design.
    // If this ever fails, somebody forked the builder.
    const route = await SELF.fetch(`${BASE}/.well-known/did.json`);
    expect(route.status).toBe(200);
    const { buildDidDocument } = await import("@/services/did-document");
    const { env } = await import("cloudflare:test");
    const built = await buildDidDocument(env as never);
    expect(await route.json()).toEqual(JSON.parse(JSON.stringify(built)));
  });
});
