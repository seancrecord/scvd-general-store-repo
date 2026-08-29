import * as ed25519 from "@noble/ed25519";
import { signedOffersForChallenge, signJws } from "@/lib/offer-receipt";
import { checkConformance } from "@/services/conformance";
import { cachedPublicKeyHex } from "@/lib/signing";
import type { Env } from "@/types";

/**
 * THE FIXTURES DESK (2026-08-27, the keeper's "tighten our shit up").
 *
 * The gap it closes: we published the schema, the MIT verifier and a
 * sample artifact, but not the thing that lets an integrator's OWN
 * test suite hold us to our contract — complete artifacts with real
 * production signatures, the exact canonical string each signature
 * covers, and the verdict the desk will return for each one. With
 * those, anyone can build a FAIL-CLOSED gate against this store —
 * tamper tests, stale timestamps, unknown signers all refused — and
 * test it without paying anything or asking permission.
 *
 * WHAT MAKES OURS DIFFERENT FROM A SNAPSHOT: every fixture is signed
 * by the live production signing path at request time and RE-VERIFIED
 * AGAINST THE LIVE DESK before it is served. A fixture whose expected
 * verdict the desk no longer produces is refused with an error naming
 * it, never served stale (derive or refuse, rule 46). Ed25519 is
 * deterministic and every payload here is frozen, so the bytes are
 * stable anyway — until a key handover, which is announced signed,
 * and the digest changing IS the announcement reaching your CI.
 *
 * WHY THE PAYLOADS ARE UNPAYABLE ON PURPOSE: a fixture offer signed
 * by our real key is still a real signature, so every fixture pins
 * payTo to the zero address and marks its resourceUrl with
 * ?fixture=conformance-desk. Schema-valid, signature-valid, and
 * impossible to mistake for a live quote — a protocol invariant does
 * the guarding, not a marker that could someday be reversed.
 */

/** Bump only when the fixture SET changes shape; artifacts are frozen. */
export const FIXTURE_SET_VERSION = "1";

/** Marked so a fixture offer can never read as a live quote. */
const FIXTURE_RESOURCE_URL =
  "https://scvd.store/api/buy/hello?fixture=conformance-desk";

/** The zero address: unpayable by protocol invariant, forever. */
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** USDC on Base, the store's own asset constant's value, frozen. */
const FIXTURE_ASSET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

/**
 * Frozen clocks. EXPIRED_NOW puts validUntil five minutes into
 * 2025-01-01, expired forever. LIVE_NOW puts validUntil at exactly
 * 2030-01-01T00:00:00Z — the "live" fixture goes stale that morning,
 * deliberately visible: the self-check below starts refusing the set,
 * and whoever is keeping the store then re-freezes the clock.
 */
const EXPIRED_NOW = 1735689600; // 2025-01-01T00:00:00Z
const LIVE_NOW = 1893456000 - 300; // validUntil 2030-01-01T00:00:00Z

/** Receipt clock: any frozen past instant; receipts do not expire. */
const RECEIPT_ISSUED_AT = EXPIRED_NOW;
const RECEIPT_TX = `0x${"ab".repeat(32)}`;

/**
 * The unknown signer: a fixed, PUBLIC seed (32 bytes of 0x42). Its
 * signatures are real ed25519 and verify against its own key — which
 * is the lesson the fixture teaches: "signature verifies" and "signer
 * is in the registry" are different checks, and an integration that
 * conflates them fails open. Publishing the seed is deliberate; this
 * key attests nothing and never will.
 */
const UNKNOWN_SEED_HEX = "42".repeat(32);

const FROZEN_ACCEPT = {
  scheme: "exact",
  network: "eip155:8453",
  amount: "500000",
  asset: FIXTURE_ASSET,
  payTo: ZERO_ADDRESS,
} as const;

export interface ConformanceFixture {
  id: string;
  /** The complete compact JWS, real signature included. */
  artifact: string;
  /**
   * The exact ASCII the signature covers (RFC 7515 signing input,
   * "header.payload"). This is what lets you tell a signature-contract
   * failure apart from a policy failure in your own tests.
   */
  canonical_signed_input: string;
  /** The decoded payload, for reference; the JWS is the artifact. */
  payload: Record<string, unknown>;
  /** The exact desk request whose result the expectation describes. */
  call: Record<string, unknown>;
  /** Fields the desk's verdict MUST carry for this call. */
  expect: Record<string, unknown>;
  note: string;
  tampered_from?: string;
}

function base64UrlFromString(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function padded(part: string): string {
  return (
    part.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (part.length % 4)) % 4)
  );
}

function decodeSegment(part: string): Record<string, unknown> {
  return JSON.parse(atob(padded(part))) as Record<string, unknown>;
}

function signingInputOf(jws: string): string {
  const [header, body] = jws.split(".");
  return `${header}.${body}`;
}

/** Flip one signed byte: same header, same signature, amount changed. */
function tamperAmount(jws: string): string {
  const [header, body, signature] = jws.split(".");
  const payload = decodeSegment(body ?? "");
  payload["amount"] = "999999";
  return `${header}.${base64UrlFromString(JSON.stringify(payload))}.${signature}`;
}

async function offerJws(env: Env, nowSeconds: number): Promise<string> {
  const extensions = await signedOffersForChallenge(
    env,
    FIXTURE_RESOURCE_URL,
    [FROZEN_ACCEPT],
    nowSeconds,
  );
  const offers = (
    (extensions?.["offer-receipt"] as Record<string, unknown> | undefined)?.[
      "info"
    ] as Record<string, unknown> | undefined
  )?.["offers"] as Array<Record<string, unknown>> | undefined;
  const jws = offers?.[0]?.["signature"];
  if (typeof jws !== "string") {
    throw new Error("the production offer path returned no offer");
  }
  return jws;
}

async function receiptJws(env: Env): Promise<string> {
  // The receipt payload, built with the same fields and order
  // withReceiptHeader signs, and the same signer.
  return signJws(env, {
    version: 1,
    network: "eip155:8453",
    resourceUrl: FIXTURE_RESOURCE_URL,
    payer: ZERO_ADDRESS,
    issuedAt: RECEIPT_ISSUED_AT,
    transaction: RECEIPT_TX,
  });
}

async function unknownSignerJws(): Promise<{ jws: string; publicKeyHex: string }> {
  const seed = Uint8Array.from(
    UNKNOWN_SEED_HEX.match(/.{2}/g) as string[],
    (byte) => Number.parseInt(byte, 16),
  );
  const publicKey = await ed25519.getPublicKeyAsync(seed);
  const publicKeyHex = [...publicKey]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const header = base64UrlFromString(
    JSON.stringify({ alg: "EdDSA", kid: "did:web:fixtures.invalid#key-1" }),
  );
  const body = base64UrlFromString(
    JSON.stringify({
      version: 1,
      resourceUrl: FIXTURE_RESOURCE_URL,
      ...FROZEN_ACCEPT,
      validUntil: EXPIRED_NOW + 300,
    }),
  );
  const signature = await ed25519.signAsync(
    new TextEncoder().encode(`${header}.${body}`),
    seed,
  );
  const sigB64 = btoa(String.fromCharCode(...signature))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return { jws: `${header}.${body}.${sigB64}`, publicKeyHex };
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function fixture(
  id: string,
  jws: string,
  call: Record<string, unknown>,
  expect: Record<string, unknown>,
  note: string,
  tamperedFrom?: string,
): ConformanceFixture {
  const [, body] = jws.split(".");
  return {
    id,
    artifact: jws,
    canonical_signed_input: signingInputOf(jws),
    payload: decodeSegment(body ?? ""),
    call: { ...call, artifact: jws },
    expect,
    note,
    ...(tamperedFrom ? { tampered_from: tamperedFrom } : {}),
  };
}

export interface FixtureSet {
  what_this_is: string;
  version: string;
  signer_registry: {
    did: string;
    signing_key_url: string;
    did_json_url: string;
    public_key_hex: string;
  };
  fixture_set_digest: string;
  digest_rule: string;
  how_to_integrate_fail_closed: string[];
  fixtures: ConformanceFixture[];
}

/**
 * Build the set, then hold every fixture against the live desk. A
 * mismatch throws with the fixture named — the route turns that into
 * an honest 500 rather than serving a fixture the desk disagrees with.
 */
export async function buildFixtureSet(env: Env): Promise<FixtureSet> {
  const publicKeyHex = await cachedPublicKeyHex(env.SIGNING_KEY);
  const offerLive = await offerJws(env, LIVE_NOW);
  const offerExpired = await offerJws(env, EXPIRED_NOW);
  const receipt = await receiptJws(env);
  const unknown = await unknownSignerJws();
  const offlineCall = { public_key_hex: publicKeyHex };

  const fixtures: ConformanceFixture[] = [
    fixture(
      "offer-valid-live",
      offerLive,
      offlineCall,
      { verdict: "conforms", kind: "offer", live: true, key_resolution: "offline" },
      "A well-formed offer, really signed by the store's live key, valid until 2030-01-01 — at which point this fixture goes stale ON PURPOSE and the set's self-check starts refusing to serve it. payTo is the zero address and the resourceUrl carries ?fixture=, so it can never be mistaken for a live quote.",
    ),
    fixture(
      "offer-valid-expired",
      offerExpired,
      offlineCall,
      { verdict: "conforms", kind: "offer", live: false, key_resolution: "offline" },
      "Identical construction, validUntil frozen in 2025. This is the conforms/live split in one artifact: correctly shaped, correctly signed, and no longer payable. An integration that collapses those two answers into one boolean fails somebody — this fixture is the test for which somebody.",
    ),
    fixture(
      "offer-tampered",
      tamperAmount(offerLive),
      offlineCall,
      { verdict: "does_not_conform", kind: "offer", key_resolution: "offline" },
      "offer-valid-live with one signed field changed (amount 500000 → 999999) and the original signature left in place. The payload still parses; the signature no longer covers these bytes. Your gate must refuse this without human eyes on it.",
      "offer-valid-live",
    ),
    fixture(
      "receipt-valid",
      receipt,
      offlineCall,
      { verdict: "conforms", kind: "receipt", live: null, key_resolution: "offline" },
      "A well-formed receipt, really signed. live is null by contract: a receipt has nothing to expire, and reporting false would invent a failure.",
    ),
    fixture(
      "receipt-tampered",
      tamperAmount(receipt),
      offlineCall,
      { verdict: "does_not_conform", key_resolution: "offline" },
      "receipt-valid with a signed byte flipped. Same rule as the tampered offer: parseable is not verified.",
      "receipt-valid",
    ),
    fixture(
      "unknown-signer",
      unknown.jws,
      offlineCall,
      { verdict: "does_not_conform", key_resolution: "offline" },
      `Signed by a real ed25519 key that is NOT in this store's registry (public seed ${UNKNOWN_SEED_HEX.slice(0, 8)}…, published on purpose — it attests nothing). Checked against the store's key it fails, which is this record's expectation. Checked against its own key (${unknown.publicKeyHex}) the SIGNATURE verifies — and that is the lesson: 'signature verifies' and 'signer is authorized' are different checks. A gate that accepts any valid signature fails open; verify against the registry you pinned, not the key the artifact suggests.`,
    ),
  ];

  // DERIVE OR REFUSE: every expectation is re-earned against the live
  // desk before anything is served.
  for (const entry of fixtures) {
    const outcome = await checkConformance(
      entry.call as Parameters<typeof checkConformance>[0],
      env,
    );
    if (outcome.status !== 200 || !outcome.verdict) {
      throw new Error(`fixture self-check could not run: ${entry.id}`);
    }
    const verdict = outcome.verdict as unknown as Record<string, unknown>;
    for (const [field, expected] of Object.entries(entry.expect)) {
      if (verdict[field] !== expected) {
        throw new Error(
          `fixture self-check failed: ${entry.id}.${field} — the desk said ${JSON.stringify(
            verdict[field],
          )}, the fixture promises ${JSON.stringify(expected)}`,
        );
      }
    }
  }

  const digest = await sha256Hex(
    JSON.stringify(fixtures.map((entry) => ({ id: entry.id, artifact: entry.artifact }))),
  );

  return {
    what_this_is:
      "Complete signed artifacts for building a FAIL-CLOSED integration against this store's conformance desk without paying anything: real signatures from the production signing path, the exact canonical string each signature covers, the exact desk call to make, and the verdict it returns. Every fixture was re-verified against the live desk before this response was served — a fixture the desk disagrees with is refused, never served.",
    version: FIXTURE_SET_VERSION,
    signer_registry: {
      did: "did:web:scvd.store",
      signing_key_url: "https://scvd.store/.well-known/scvd-signing-key",
      did_json_url: "https://scvd.store/.well-known/did.json",
      public_key_hex: publicKeyHex,
    },
    fixture_set_digest: digest,
    digest_rule:
      "sha256 over the canonical JSON of [{id, artifact}]. Pin it. It changes on exactly two events, both announced: a key handover (announced signed, by the outgoing key, at the signing-key URL before the new key signs anything) and a versioned fixture-set change. A digest change your pipeline did not expect is a finding, not noise.",
    how_to_integrate_fail_closed: [
      "Pin fixture_set_digest and fail your build when it moves unexpectedly.",
      "Verify every artifact's signature yourself, offline, over canonical_signed_input, against the registry key you pinned — never against a key the artifact carries.",
      "Wire the expected verdicts into your own policy gate and assert them in your own suite; the desk at POST /api/conformance/v1 will keep returning them, and the frozen v1 contract only ever adds fields.",
      "Write the tamper tests: the *-tampered and unknown-signer fixtures must FAIL your gate. A gate only proven on passing cases is not a gate.",
      "Treat unknown fields in a verdict as additive (the v1 contract), but treat unknown fields in an ARTIFACT you are paying against however your own risk tolerance says — you know your own risk better than we do.",
    ],
    fixtures,
  };
}
