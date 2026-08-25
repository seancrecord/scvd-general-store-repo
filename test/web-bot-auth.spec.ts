import { SELF, env } from "cloudflare:test";
import * as ed25519 from "@noble/ed25519";
import { describe, expect, it } from "vitest";
import {
  DIRECTORY_CONTENT_TYPE,
  DIRECTORY_PATH,
  jwkThumbprint,
  signedDirectory,
  webBotAuthHeaders,
  webBotAuthJwk,
  type Ed25519Jwk,
  type WbaEnv,
} from "@/lib/web-bot-auth";
import { probeOnce } from "@/services/preflight";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * WEB BOT AUTH ON THE STORE'S OWN EGRESS (2026-08-11).
 *
 * These tests verify the SIGNATURES, not the code path that made
 * them: every "it signs" case reconstructs the RFC 9421 signature
 * base from the emitted headers alone — the way a receiving origin
 * would — and checks it with an independent ed25519 call against the
 * JWK the directory publishes. A test that verified through the
 * signing function would be the certificate defect all over again
 * (corrections, 2026-07-30): invisible from inside, total from
 * outside.
 *
 * And the instrument is tested by TAMPERING: a flipped signature
 * byte must fail, or the verifying assertions above it prove nothing.
 */

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function signatureBytes(header: string | undefined): Uint8Array {
  const match = header ? /^sig1=:([A-Za-z0-9+/=]+):$/.exec(header) : null;
  if (!match?.[1]) {
    throw new Error(`Signature header did not parse: ${header}`);
  }
  return Uint8Array.from(atob(match[1]), (char) => char.charCodeAt(0));
}

/** The params sf-value, exactly as the header carries it. */
function signatureParams(header: string | undefined): string {
  if (!header?.startsWith("sig1=")) {
    throw new Error(`Signature-Input did not parse: ${header}`);
  }
  return header.slice("sig1=".length);
}

async function publishedKey(): Promise<Uint8Array> {
  const jwk = await webBotAuthJwk(testEnv);
  expect(jwk, "no egress key in the test env").not.toBeNull();
  return base64UrlToBytes((jwk as Ed25519Jwk).x);
}

describe("signed egress headers", () => {
  it("emits a signature a stranger can verify from the headers alone", async () => {
    const headers = await webBotAuthHeaders(
      testEnv,
      "https://example.com/api/buy/thing",
      { Accept: "application/json" },
    );
    // Identity rides along unchanged; the signature is additive.
    expect(headers["User-Agent"]).toContain("scvd-general-store");
    expect(headers.Accept).toBe("application/json");
    expect(headers["Signature-Agent"]).toBe(`"${BASE}"`);

    const params = signatureParams(headers["Signature-Input"]);
    expect(params).toContain('tag="web-bot-auth"');
    expect(params).toContain('alg="ed25519"');
    expect(params).toMatch(/;created=\d+;expires=\d+;/);
    expect(params).toContain('nonce="');

    // Reconstruct the base the way a verifier would: from the wire.
    const base = [
      `"@authority": example.com`,
      `"signature-agent": ${headers["Signature-Agent"]}`,
      `"@signature-params": ${params}`,
    ].join("\n");
    const verified = await ed25519.verifyAsync(
      signatureBytes(headers.Signature),
      new TextEncoder().encode(base),
      await publishedKey(),
    );
    expect(verified).toBe(true);
  });

  it("fails verification when one signature byte is tampered", async () => {
    const headers = await webBotAuthHeaders(testEnv, "https://example.com/x");
    const base = [
      `"@authority": example.com`,
      `"signature-agent": ${headers["Signature-Agent"]}`,
      `"@signature-params": ${signatureParams(headers["Signature-Input"])}`,
    ].join("\n");
    const tampered = signatureBytes(headers.Signature);
    tampered[0] = (tampered[0] ?? 0) ^ 0x01;
    const verified = await ed25519.verifyAsync(
      tampered,
      new TextEncoder().encode(base),
      await publishedKey(),
    );
    expect(verified).toBe(false);
  });

  it("carries the RFC 7638 thumbprint of the published JWK as keyid", async () => {
    const headers = await webBotAuthHeaders(testEnv, "https://example.com/x");
    const jwk = (await webBotAuthJwk(testEnv)) as Ed25519Jwk;
    expect(headers["Signature-Input"]).toContain(
      `keyid="${await jwkThumbprint(jwk)}"`,
    );
  });

  it("signs with the EGRESS key, never the artifact key", async () => {
    // The two seeds are different RFC 8032 vectors on purpose; a
    // signature that verifies against SIGNING_KEY's public key here
    // means somebody wired one key into both hats.
    const headers = await webBotAuthHeaders(testEnv, "https://example.com/x");
    const base = [
      `"@authority": example.com`,
      `"signature-agent": ${headers["Signature-Agent"]}`,
      `"@signature-params": ${signatureParams(headers["Signature-Input"])}`,
    ].join("\n");
    const artifactKey = await ed25519.getPublicKeyAsync(testEnv.SIGNING_KEY);
    const verified = await ed25519.verifyAsync(
      signatureBytes(headers.Signature),
      new TextEncoder().encode(base),
      artifactKey,
    );
    expect(verified).toBe(false);
  });

  it("fails open: no key means exactly the unsigned headers of before", async () => {
    const unkeyed: WbaEnv = { STORE_BASE_URL: BASE };
    const headers = await webBotAuthHeaders(unkeyed, "https://example.com/x", {
      Accept: "application/json",
    });
    expect(headers["User-Agent"]).toContain("scvd-general-store");
    expect(headers.Accept).toBe("application/json");
    expect(headers.Signature).toBeUndefined();
    expect(headers["Signature-Input"]).toBeUndefined();
    expect(headers["Signature-Agent"]).toBeUndefined();
  });

  it("a malformed key also fails open rather than failing the probe", async () => {
    const broken: WbaEnv = {
      STORE_BASE_URL: BASE,
      WBA_SIGNING_KEY: "not-a-seed",
    };
    const headers = await webBotAuthHeaders(broken, "https://example.com/x");
    expect(headers.Signature).toBeUndefined();
    expect(headers["User-Agent"]).toContain("scvd-general-store");
  });
});

describe("the probes carry it", () => {
  it("probeOnce sends the triplet when handed env — the choke point preflight, audits and conformance watches share", async () => {
    let sent: Record<string, string> | undefined;
    const fake: typeof fetch = (input, init) => {
      sent = init?.headers as Record<string, string>;
      return Promise.resolve(new Response("{}", { status: 402 }));
    };
    await probeOnce("https://example.com/api/buy/x", fake, "", testEnv);
    expect(sent).toBeDefined();
    expect(sent?.["Signature-Agent"]).toBe(`"${BASE}"`);
    expect(sent?.["Signature-Input"]).toContain('tag="web-bot-auth"');
    expect(sent?.Signature).toMatch(/^sig1=:/);
    // The probe's original manner is intact underneath.
    expect(sent?.Accept).toBe("application/json");
  });
});

describe("the directory", () => {
  it("serves the JWK set under the draft content type", async () => {
    const response = await SELF.fetch(`${BASE}${DIRECTORY_PATH}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(DIRECTORY_CONTENT_TYPE);
    const body = (await response.json()) as { keys: Ed25519Jwk[] };
    const jwk = (await webBotAuthJwk(testEnv)) as Ed25519Jwk;
    expect(body.keys).toEqual([jwk]);
  });

  it("proves possession: the directory response signs its own authority", async () => {
    const response = await SELF.fetch(`${BASE}${DIRECTORY_PATH}`);
    const signatureInput = response.headers.get("Signature-Input") ?? "";
    const params = signatureParams(signatureInput);
    expect(params).toContain('tag="http-message-signatures-directory"');
    const base = [
      `"@authority": scvd.store`,
      `"@signature-params": ${params}`,
    ].join("\n");
    const verified = await ed25519.verifyAsync(
      signatureBytes(response.headers.get("Signature") ?? ""),
      new TextEncoder().encode(base),
      await publishedKey(),
    );
    expect(verified).toBe(true);
  });

  it("is a 404, not an empty 200, when no key is configured", async () => {
    // "This store publishes no keys" and "this store has not turned
    // this on" are different statements; the lib returns null so the
    // route can answer with the second.
    const directory = await signedDirectory({ STORE_BASE_URL: BASE });
    expect(directory).toBeNull();
  });

  it("names the key with its own thumbprint, without moving it", async () => {
    /*
     * THE CLAIM THIS GUARDS: publishing `kid` cannot change the
     * thumbprint, because RFC 7638 canonicalizes an OKP key over
     * crv, kty and x only. That is the entire reason adding a kid is
     * an addition rather than a key rotation — and a rotation nobody
     * announced would break every signature already in the wild.
     *
     * Asserted rather than reasoned about, because "the spec says it
     * ignores extra fields" is exactly the kind of true-sounding
     * sentence that is worth ten seconds of proof on a signing path.
     */
    const { jwkThumbprint } = await import("@/lib/web-bot-auth");
    const bare = {
      kty: "OKP",
      crv: "Ed25519",
      x: "myYPVJS-xYeANbKAFcKWJOIqWCmruzIIMuVr0ZWKevE",
    } as const;
    const named = { ...bare, kid: "whatever-name-we-like" };
    expect(await jwkThumbprint(named)).toBe(await jwkThumbprint(bare));
  });
});
