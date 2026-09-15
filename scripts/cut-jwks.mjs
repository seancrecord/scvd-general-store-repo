#!/usr/bin/env node
/**
 * npm run jwks:cut — derive src/store/directory-jwks.json from the
 * committed public key at registry/agntcy/record-signing-key.pub.pem.
 *
 * WHAT THIS KEY IS, AND WHAT IT IS NOT. It authorises OASF records
 * published to the AGNTCY Directory under the name
 * https://scvd.store/agents/general-store, and nothing else. It is NOT
 * SIGNING_KEY: it never signs an artifact, never touches money, and its
 * private half never enters this repo or the Worker. Only the public
 * half is here, and only the public half is served.
 *
 * WHY DERIVED RATHER THAN TYPED. A JWKS is a key written out in a
 * second notation. Hand-copying a 43-character base64url coordinate is
 * exactly the kind of transcription nobody proofreads and no reader can
 * check by eye — and the failure is silent: name verification simply
 * says "does not match any domain key" with no hint that the published
 * key is a typo of the real one. So the PEM is the source, this
 * computes the rest, and test/directory-jwks.spec.ts re-derives it and
 * refuses any drift.
 *
 * WHAT DIRECTORY ACTUALLY MATCHES ON, read out of agntcy/dir rather
 * than its docs: server/naming/keys.go compares raw DER bytes
 * (`bytes.Equal`), and server/naming/types.go calls the key id "an
 * optional identifier". So `kty`, `crv`, `x` and `y` are load-bearing —
 * they are the only way to rebuild the point — while `kid`, `alg` and
 * `use` are not consulted for matching. They are written anyway: they
 * cost nothing, they are conventional, and third-party JWKS readers
 * exist that skip a key carrying no `kid`.
 *
 * `kid` is the RFC 7638 thumbprint, so it is a fact about the key
 * rather than a name somebody chose — two people deriving it from the
 * same PEM get the same id.
 */
import { createHash } from "node:crypto";
import { createPublicKey } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const REPO = new URL("..", import.meta.url).pathname;

export const PEM_PATH = join(REPO, "registry", "agntcy", "record-signing-key.pub.pem");
export const JWKS_PATH = join(REPO, "src", "store", "directory-jwks.json");

/** RFC 7638: SHA-256 over the required members, lexicographic, no whitespace. */
export function thumbprint(jwk) {
  const canonical =
    jwk.kty === "EC"
      ? `{"crv":"${jwk.crv}","kty":"${jwk.kty}","x":"${jwk.x}","y":"${jwk.y}"}`
      : `{"crv":"${jwk.crv}","kty":"${jwk.kty}","x":"${jwk.x}"}`;
  return createHash("sha256").update(canonical).digest("base64url");
}

/** The curve names agntcy/dir accepts, keyed by the JWK curve. */
const ALG_BY_CURVE = { "P-256": "ES256", "P-384": "ES384" };

/** The JWKS this domain publishes, computed from the PEM. */
export function deriveJwks(pem) {
  const key = createPublicKey(pem);
  const { kty, crv, x, y } = key.export({ format: "jwk" });
  if (kty !== "EC") {
    throw new Error(`record-signing-key.pub.pem is ${kty}; this cut only writes EC keys`);
  }
  const alg = ALG_BY_CURVE[crv];
  if (!alg) throw new Error(`curve ${crv} is not one agntcy/dir accepts`);
  const jwk = { kty, crv, x, y };
  return { keys: [{ ...jwk, use: "sig", alg, kid: thumbprint(jwk) }] };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const jwks = deriveJwks(readFileSync(PEM_PATH, "utf8"));
  writeFileSync(JWKS_PATH, `${JSON.stringify(jwks, null, 2)}\n`);
  const [key] = jwks.keys;
  console.log(`src/store/directory-jwks.json: ${key.kty} ${key.crv} (${key.alg}), kid ${key.kid}`);
}
