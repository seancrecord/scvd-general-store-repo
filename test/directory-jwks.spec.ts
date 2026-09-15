import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import jwks from "../src/store/directory-jwks.json";
import pem from "../registry/agntcy/record-signing-key.pub.pem?raw";
import { OASF_RECORD_NAME } from "@/lib/oasf-record";

/**
 * THE PUBLISHED KEY IS THE KEY WE HOLD, AND THE CHECK IS ARITHMETIC.
 *
 * A JWKS is a public key written out in a second notation, and the
 * failure mode of a hand-copied coordinate is silent: name
 * verification reports "does not match any domain key", which reads
 * like the wrong key was used for signing rather than like a typo in
 * what we published. So this re-derives the whole document from the
 * committed PEM and compares, rather than eyeballing 43 characters of
 * base64url.
 *
 * WHAT DIRECTORY MATCHES ON, read out of agntcy/dir rather than its
 * docs: `server/naming/keys.go` compares raw DER bytes with
 * `bytes.Equal`, and `IsValidKeyType` accepts ed25519, ecdsa-p256,
 * ecdsa-p384 and rsa. `server/naming/types.go` calls the key id "an
 * optional identifier". So the four coordinate fields are load-bearing
 * and the rest are courtesy — which is why this holds the four
 * strictly and the rest to shape.
 */
describe("the Directory record-signing JWKS", () => {
  it("is derived from the committed public key, not typed", async () => {
    const { deriveJwks } = await import("../scripts/cut-jwks.mjs");
    expect(jwks, "run: npm run jwks:cut").toEqual(deriveJwks(pem));
  });

  it("publishes a key of a type agntcy/dir accepts", () => {
    expect(jwks.keys).toHaveLength(1);
    const [key] = jwks.keys;
    expect(key!.kty).toBe("EC");
    // ecdsa-p256 / ecdsa-p384 are the EC curves dir's IsValidKeyType allows.
    expect(["P-256", "P-384"]).toContain(key!.crv);
    for (const field of ["x", "y"] as const) {
      // base64url, unpadded — a padded or base64 coordinate rebuilds a different point.
      expect(key![field], `${field} is not unpadded base64url`).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  /**
   * The id is the RFC 7638 thumbprint rather than a name somebody
   * chose, so two people deriving it from the same PEM agree, and a
   * key swapped without a re-cut cannot keep the old id.
   */
  it("names the key by its own thumbprint", async () => {
    const { thumbprint } = await import("../scripts/cut-jwks.mjs");
    const [key] = jwks.keys;
    expect(key!.kid).toBe(thumbprint(key!));
  });

  it("serves the file at the path name verification reads", async () => {
    const origin = new URL(OASF_RECORD_NAME).origin;
    const response = await SELF.fetch(`${origin}/.well-known/jwks.json`);
    expect(response.status, "name verification fetches this exact path").toBe(200);
    expect(response.headers.get("content-type")).toContain("jwk-set+json");
    expect(await response.json()).toEqual(jwks);
  });

  /**
   * The private half is not in this repository, and the guard for that
   * is not a habit — a PEM header naming a private key anywhere in the
   * tree fails here.
   */
  it("publishes only the public half", async () => {
    expect(pem).toContain("BEGIN PUBLIC KEY");
    expect(pem).not.toContain("PRIVATE KEY");
    const tree = {
      ...import.meta.glob("../registry/**/*.pem", { query: "?raw", import: "default", eager: true }),
      ...import.meta.glob("../src/**/*.pem", { query: "?raw", import: "default", eager: true }),
      ...import.meta.glob("../scripts/**/*.pem", { query: "?raw", import: "default", eager: true }),
    };
    for (const [path, body] of Object.entries(tree as Record<string, string>)) {
      expect(body, `${path} carries private key material`).not.toContain("PRIVATE KEY");
    }
  });
});
