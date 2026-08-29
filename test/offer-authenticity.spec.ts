import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  issuerHostOf,
  readOfferAuthenticity,
  readOfferAuthenticityDetail,
  signedOffersFromChallenge,
} from "@/services/offer-authenticity";
import type { WardRound } from "@/services/ward-round";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * L3c, ENDPOINT SIDE (built 2026-08-29, on the keeper's "build it and
 * test it to see how effective").
 *
 * The load-bearing case is the FORGED one. Every other check here
 * guards a way the instrument could quietly say "fine" — but the
 * whole reason it exists is that a forged offer currently reads
 * `ready` on our preflight, on our round, and on everyone else's. If
 * the forgery case ever stops failing, this instrument is decoration.
 */

const b64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const encode = (value: unknown): string =>
  b64url(new TextEncoder().encode(JSON.stringify(value)));

/** A compact JWS whose signature bytes are whatever we hand it. */
function jws(kid: string, payload: unknown, signature: Uint8Array): string {
  return `${encode({ alg: "EdDSA", kid })}.${encode(payload)}.${b64url(signature)}`;
}

function challenge(signatures: string[]): string {
  return btoa(
    JSON.stringify({
      x402Version: 2,
      accepts: [{ scheme: "exact", network: "eip155:8453" }],
      extensions: {
        "offer-receipt": {
          info: { offers: signatures.map((signature) => ({ signature })) },
        },
      },
    }),
  );
}

function round(hosts: Array<{ host: string; challenge_bytes: string | null }>): WardRound {
  return {
    week: "2026-W35",
    at: "2026-08-29T00:00:00.000Z",
    listed_resources: hosts.length,
    coverage_suspect: false,
    capped: false,
    our_search_presence: true,
    hosts: hosts.map((entry) => ({
      host: entry.host,
      url: `https://${entry.host}/api/x`,
      verdict: "ready",
      failed: [],
      advisories: [],
      /* null = the round stored no capture block at all (a round
       * older than the capture); "" = captured, and the door served
       * nothing readable. The instrument must tell those apart. */
      ...(entry.challenge_bytes === null
        ? {}
        : { evidence: { challenge_bytes: entry.challenge_bytes || null } }),
    })),
  } as unknown as WardRound;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("finding the signatures a door served", () => {
  it("pulls every JWS out of the offer-receipt extension", () => {
    const found = signedOffersFromChallenge(challenge(["a.b.c", "d.e.f"]));
    expect(found).toEqual(["a.b.c", "d.e.f"]);
  });

  it("says nothing about a door that served no extension", () => {
    expect(signedOffersFromChallenge(btoa(JSON.stringify({ x402Version: 2 })))).toEqual([]);
    expect(signedOffersFromChallenge(null)).toEqual([]);
    expect(signedOffersFromChallenge("not base64 at all")).toEqual([]);
  });
});

describe("reading the issuer out of a kid", () => {
  it("takes the did:web host and nothing else", () => {
    expect(issuerHostOf("did:web:issuer.example#key-1")).toBe("issuer.example");
    expect(issuerHostOf("did:web:issuer.example:path:more#k")).toBe("issuer.example");
    expect(issuerHostOf("did:key:z6Mk")).toBeUndefined();
    expect(issuerHostOf(undefined)).toBeUndefined();
  });
});

describe("what the walk says about a door", () => {
  /** A complete offer payload, so verifyArtifact judges the signature
   * rather than refusing on a missing field. */
  const offerPayload = (overrides: Record<string, unknown> = {}) => ({
    version: 1,
    resourceUrl: "https://door.example/api/x",
    scheme: "exact",
    network: "eip155:8453",
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    payTo: "0x0000000000000000000000000000000000000001",
    amount: "5000",
    validUntil: 4102444800,
    ...overrides,
  });

  /** A did:web document publishing one Ed25519 key. */
  const didDoc = (kid: string, raw: Uint8Array) =>
    JSON.stringify({
      id: kid.split("#")[0],
      verificationMethod: [
        {
          id: kid,
          type: "JsonWebKey2020",
          controller: kid.split("#")[0],
          publicKeyJwk: { kty: "OKP", crv: "Ed25519", x: b64url(raw) },
        },
      ],
    });

  /*
   * THE POSITIVE CONTROL, and it is not optional.
   *
   * Without a signature that genuinely VERIFIES, "failed" could mean
   * "this instrument fails everything" and the forgery case below
   * would pass for the wrong reason — the exact shape of test this
   * store keeps finding in other people's instruments.
   */
  it("A GENUINE SIGNATURE VERIFIES — the control the forgery case needs", async () => {
    const pair = (await crypto.subtle.generateKey("Ed25519", true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    const raw = new Uint8Array(
      (await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer,
    );
    const kid = "did:web:issuer.example#key-1";
    const payload = offerPayload();
    const signingInput = `${encode({ alg: "EdDSA", kid })}.${encode(payload)}`;
    const signature = new Uint8Array(
      await crypto.subtle.sign(
        "Ed25519",
        pair.privateKey,
        new TextEncoder().encode(signingInput),
      ),
    );
    const genuine = `${signingInput}.${b64url(signature)}`;

    vi.stubGlobal("fetch", async (input: unknown) => {
      if (String(input).includes("issuer.example")) {
        return new Response(didDoc(kid, raw), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`unexpected fetch: ${String(input)}`);
    });

    const reading = await readOfferAuthenticity(
      testEnv,
      new Date("2026-08-29T00:00:00Z"),
      { round: round([{ host: "door.example", challenge_bytes: challenge([genuine]) }]) },
    );
    expect(
      reading!.offers_verified,
      "a real signature over a complete offer must verify, or every verdict here is noise",
    ).toBe(1);
    expect(reading!.offers_failed).toBe(0);
    expect(reading!.by_verdict.verified).toBe(1);
  });

  it("A FORGED SIGNATURE FAILS — the whole point of the instrument", async () => {
    // A real key, a real did:web document, and a signature that is
    // simply wrong. Today this door reads `ready` everywhere.
    // Same complete payload and same published key as the control
    // above — ONLY the signature bytes are wrong. That isolates the
    // signature as the thing under test.
    const pair = (await crypto.subtle.generateKey("Ed25519", true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    const raw = new Uint8Array(
      (await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer,
    );
    const kid = "did:web:issuer.example#key-1";
    const forged = jws(kid, offerPayload(), crypto.getRandomValues(new Uint8Array(64)));

    vi.stubGlobal("fetch", async (input: unknown) => {
      if (String(input).includes("issuer.example")) {
        return new Response(didDoc(kid, raw), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`unexpected fetch: ${String(input)}`);
    });

    const reading = await readOfferAuthenticity(
      testEnv,
      new Date("2026-08-29T00:00:00Z"),
      { round: round([{ host: "door.example", challenge_bytes: challenge([forged]) }]) },
    );
    expect(reading!.offers_seen).toBe(1);
    expect(
      reading!.offers_failed,
      "a signature that does not verify must be counted as failing",
    ).toBe(1);
    expect(reading!.by_verdict.failed).toBe(1);
    expect(reading!.by_verdict.verified).toBe(0);
  });

  /*
   * THE DEFECT THE CONTROL CAUGHT, now pinned.
   *
   * verifyArtifact's rolled-up `ok` folds schema, alg, kid and
   * signature together. Reading it as authenticity meant a genuinely
   * signed offer with one sloppy field — a string "1" where the
   * revision wants a number — was booked as a FORGERY. Calling a real
   * signature a forgery because a field was typed wrong is the worst
   * thing this instrument could do to a stranger.
   */
  it("a real signature over a schema-sloppy offer is NOT a forgery", async () => {
    const pair = (await crypto.subtle.generateKey("Ed25519", true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    const raw = new Uint8Array(
      (await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer,
    );
    const kid = "did:web:issuer.example#key-1";
    // Genuinely signed; version is the wrong type on purpose.
    const payload = offerPayload({ version: "1" });
    const signingInput = `${encode({ alg: "EdDSA", kid })}.${encode(payload)}`;
    const signature = new Uint8Array(
      await crypto.subtle.sign(
        "Ed25519",
        pair.privateKey,
        new TextEncoder().encode(signingInput),
      ),
    );
    const genuine = `${signingInput}.${b64url(signature)}`;

    vi.stubGlobal("fetch", async (input: unknown) => {
      if (String(input).includes("issuer.example")) {
        return new Response(didDoc(kid, raw), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`unexpected fetch: ${String(input)}`);
    });

    const reading = await readOfferAuthenticity(
      testEnv,
      new Date("2026-08-29T00:00:00Z"),
      { round: round([{ host: "door.example", challenge_bytes: challenge([genuine]) }]) },
    );
    expect(
      reading!.offers_failed,
      "a schema slip must never be published as a forged signature",
    ).toBe(0);
    expect(reading!.offers_verified).toBe(1);
    expect(reading!.by_verdict.verified).toBe(1);
    // The schema problem is not lost — just not called fraud.
    expect(reading!.offers_schema_failed).toBe(1);
    expect(reading!.what_this_counts).toContain("is not a forgery");
  });

  it("an unreachable issuer is OUR gap, never the door's failure", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("issuer host down");
    });
    const forged = jws("did:web:down.example#k", { a: 1 }, new Uint8Array(64));
    const reading = await readOfferAuthenticity(testEnv, new Date(), {
      round: round([{ host: "door.example", challenge_bytes: challenge([forged]) }]),
    });
    expect(reading!.by_verdict.issuer_unreachable).toBe(1);
    expect(
      reading!.by_verdict.failed,
      "our blindness must never be booked as their forgery",
    ).toBe(0);
    expect(reading!.offers_failed).toBe(0);
  });

  it("a door serving unsigned offers has failed nothing", async () => {
    const reading = await readOfferAuthenticity(testEnv, new Date(), {
      round: round([
        { host: "plain.example", challenge_bytes: btoa(JSON.stringify({ x402Version: 2 })) },
      ]),
    });
    expect(reading!.by_verdict.unsigned).toBe(1);
    expect(reading!.by_verdict.failed).toBe(0);
    expect(reading!.what_this_is_not).toContain("has not failed anything");
  });

  /*
   * THE DISTINCTION A LIVE READING TAUGHT, 2026-08-29.
   *
   * The first real run returned "0 of 0 doors serve a signed offer at
   * all" across 972 doors. That reads as a finding about the market
   * and was nothing of the kind — the round on file was sealed before
   * evidence capture existed, so this instrument had nothing to read.
   * Our gap wearing their absence, which is the defect this store's
   * entire audit is about.
   */
  it("a round carrying NO evidence is our blindness, not their absence", async () => {
    const reading = await readOfferAuthenticity(testEnv, new Date(), {
      round: round([{ host: "quiet.example", challenge_bytes: null }]),
    });
    expect(reading!.by_verdict.evidence_absent).toBe(1);
    expect(reading!.by_verdict.not_served).toBe(0);
    expect(reading!.hosts_with_evidence).toBe(0);
    // And it must SAY so, first, before any number a reader could
    // mistake for a measurement.
    expect(reading!.what_this_counts).toContain("COULD NOT LOOK");
    expect(reading!.what_this_counts).toContain("OUR gap");
  });

  it("a door that answered but served no challenge IS not_served", async () => {
    // Evidence captured, challenge_bytes genuinely empty: we looked,
    // and there was nothing there. A different fact entirely.
    const reading = await readOfferAuthenticity(testEnv, new Date(), {
      round: round([{ host: "answered.example", challenge_bytes: "" }]),
    });
    expect(reading!.by_verdict.not_served).toBe(1);
    expect(reading!.by_verdict.evidence_absent).toBe(0);
  });

  it("resolves each issuer once however many doors it signs for", async () => {
    let resolutions = 0;
    vi.stubGlobal("fetch", async (input: unknown) => {
      if (String(input).includes("shared.example")) {
        resolutions += 1;
        return new Response("nope", { status: 404 });
      }
      throw new Error("unexpected");
    });
    const signature = jws("did:web:shared.example#k", { a: 1 }, new Uint8Array(64));
    await readOfferAuthenticity(testEnv, new Date(), {
      round: round([
        { host: "a.example", challenge_bytes: challenge([signature]) },
        { host: "b.example", challenge_bytes: challenge([signature]) },
        { host: "c.example", challenge_bytes: challenge([signature]) },
      ]),
    });
    expect(resolutions, "one issuer, one resolution, however many doors").toBe(1);
  });

  it("says when the resolution budget bound instead of silently stopping", async () => {
    vi.stubGlobal("fetch", async () => new Response("nope", { status: 404 }));
    const reading = await readOfferAuthenticity(testEnv, new Date(), {
      budget: 1,
      round: round([
        {
          host: "a.example",
          challenge_bytes: challenge([jws("did:web:one.example#k", {}, new Uint8Array(64))]),
        },
        {
          host: "b.example",
          challenge_bytes: challenge([jws("did:web:two.example#k", {}, new Uint8Array(64))]),
        },
      ]),
    });
    expect(reading!.budget_bound).toBe(true);
    expect(reading!.resolutions_spent).toBe(1);
  });
});

describe("the published shape names nobody", () => {
  it("carries no host name, however many doors it walked", async () => {
    const reading = await readOfferAuthenticity(testEnv, new Date(), {
      round: round([
        { host: "door-one.example", challenge_bytes: btoa(JSON.stringify({ x402Version: 2 })) },
        { host: "door-two.example", challenge_bytes: null },
      ]),
    });
    const serialized = JSON.stringify(reading).toLowerCase();
    expect(serialized).not.toContain("door-one.example");
    expect(serialized).not.toContain("door-two.example");
  });

  it("the keeper's own view DOES carry them, from the same walk", async () => {
    const detail = await readOfferAuthenticityDetail(testEnv, new Date(), {
      round: round([
        { host: "door-one.example", challenge_bytes: btoa(JSON.stringify({ x402Version: 2 })) },
      ]),
    });
    expect(detail!.rows.map((row) => row.host)).toEqual(["door-one.example"]);
    // Same walk, so the two can never disagree about what was seen.
    expect(detail!.reading.by_verdict.unsigned).toBe(1);
  });
});
