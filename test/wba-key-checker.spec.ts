import { describe, expect, it } from "vitest";
import { jwkThumbprint, webBotAuthJwk } from "@/lib/web-bot-auth";

/**
 * THE EGRESS-KEY CHECKER AND THE WORKER MUST DERIVE THE SAME KID.
 *
 * WBA_SIGNING_KEY is a Cloudflare Worker secret and Worker secrets are
 * write-only, so the only way to tell whether a seed found in a
 * password manager is the live egress key is to derive from it and
 * compare against the `kid` the store publishes in its directory.
 * `npm run keys:check:wba` (scripts/check-wba-key.mjs) is that
 * derivation, run on a laptop, outside the Worker.
 *
 * WHICH MEANS THE TWO CAN DRIFT, AND THE DRIFT IS SILENT AND COSTLY.
 * If the checker's canonicalisation ever parts from the Worker's, a
 * correct seed reports NO MATCH — and the reasonable next move after
 * a no-match on a key nothing can display is to rotate, replacing a
 * live published key to fix a bug in the tool that read it. The
 * failure mode is not "a wrong answer", it is "a wrong answer that
 * argues for destroying the thing it was asked about".
 *
 * So: one fixed seed, one expected kid, checked against the Worker's
 * own jwkThumbprint. The constants below were produced by the checker
 * script. If this test goes red, the two have parted, and which one
 * moved is the first question — not which constant to update.
 */

// Fixed, public, and not a key anything signs with: 32 bytes of 0xa1.
const SEED = "a1".repeat(32);
const EXPECTED_X = "vHy8tWNjdfodgkNNRmck2SN39TuYBpXdSdJtDOEiBaU";
const EXPECTED_KID = "VDux_CmeAgi2AvrAFW0bInmtCjMDD9kHOfzia5l81w0";

describe("the Web Bot Auth egress-key checker", () => {
  it("derives the kid the Worker derives, for the same seed", async () => {
    const jwk = await webBotAuthJwk({
      WBA_SIGNING_KEY: SEED,
      STORE_BASE_URL: "https://scvd.store",
    });
    expect(jwk, "the Worker derived no key from a well-formed seed").toBeTruthy();
    expect(jwk?.x).toBe(EXPECTED_X);
    // The kid a directory publishes IS the thumbprint, so this is the
    // value a reader compares the checker's output against by eye.
    expect(jwk?.kid).toBe(EXPECTED_KID);
  });

  it("derives that kid by RFC 7638 canonicalisation, not by luck", async () => {
    // Stated independently of the seed so a change to either the JWK
    // shape or the digest shows up here rather than in a rotation.
    expect(
      await jwkThumbprint({ kty: "OKP", crv: "Ed25519", x: EXPECTED_X }),
    ).toBe(EXPECTED_KID);
  });
});
