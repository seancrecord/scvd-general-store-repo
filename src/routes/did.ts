import { Hono } from "hono";
import { cachedPublicKeyHex } from "@/lib/signing";
import {
  currentKeyInServiceFrom,
  retiredKeysFor,
} from "@/store/key-registry";
import type { HonoEnv } from "@/types";

/**
 * did:web:scvd.store — the store's signing key, in the shape the x402
 * Signed Offers & Receipts extension resolves.
 *
 * The extension's JWS format identifies a signer by did:web and
 * resolves it here to find the public key. It accepts Ed25519, which
 * is what this store already signs everything with — so the key that
 * signs certificates, stamps, anchors and the handover announcement is
 * the same key an offer or receipt would carry. One key, one identity,
 * one place to check it.
 *
 * DERIVED FROM THE LIVE SECRET AND THE REGISTRY, never typed. This
 * document is a second place the signing key is published, and a
 * second place is a second thing that can go stale — which is the
 * defect this store removed from five surfaces in one day. The key
 * comes from the same cached derivation the well-known endpoint uses,
 * so did.json and /.well-known/scvd-signing-key are incapable of
 * disagreeing.
 *
 * THE PART WORTH SAYING OUT LOUD, because the extension's own
 * documentation names it as unsolved: a DID document is MUTABLE and
 * current-state only. Remove a key during rotation and there is no
 * record it was ever authorised, so a receipt signed under the old key
 * becomes unverifiable to anyone checking afterwards. Their table
 * lists on-chain attestation services as the only approach with
 * temporal durability.
 *
 * This store already has that half, built 2026-07-31 for its own
 * reasons and published free: key_history carries every retired key
 * forever with the dates it was in service, and each handover is
 * announced in an artifact SIGNED BY THE OUTGOING KEY, so the
 * authorisation chain is checkable rather than asserted. So the DID
 * document points at it rather than pretending to be sufficient on its
 * own — a verifier who needs to know whether a key was authorised at
 * issuance has somewhere to go.
 */
export const didRoutes = new Hono<HonoEnv>();

/** Raw 32-byte Ed25519 public key as base64url, which is what an OKP JWK wants. */
function base64Url(hex: string): string {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

didRoutes.get("/.well-known/did.json", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const domain = new URL(base).host;
  const did = `did:web:${domain}`;
  const publicKey = await cachedPublicKeyHex(c.env.SIGNING_KEY);
  const kid = `${did}#key-1`;

  return c.json(
    {
      "@context": [
        "https://www.w3.org/ns/did/v1",
        "https://w3id.org/security/suites/jws-2020/v1",
      ],
      id: did,
      verificationMethod: [
        {
          id: kid,
          type: "JsonWebKey2020",
          controller: did,
          publicKeyJwk: {
            kty: "OKP",
            crv: "Ed25519",
            x: base64Url(publicKey),
          },
        },
      ],
      assertionMethod: [kid],
      /**
       * EVERYTHING BELOW IS OURS, NOT THE W3C's, and it is namespaced
       * under a key a strict resolver ignores. A DID document has a
       * fixed shape and a verifier that chokes on an extra property is
       * a verifier we broke; these are notes for a reader who wants
       * more than the current key, not fields anybody must parse.
       */
      scvd: {
        /**
         * THE LIMITATION THE EXTENSION'S OWN DOCS NAME, answered.
         * A DID document is current-state only: rotate, remove the old
         * key, and nothing records it was ever authorised — so a
         * receipt signed under it becomes unverifiable afterwards.
         */
        key_history: `${base}/.well-known/scvd-signing-key`,
        key_history_note:
          "This document is mutable and shows only the key in service today, which is a known limitation of did:web rather than a choice we made. The durable record is at key_history: every key this store has ever signed with, kept published forever with the dates it was in service, and each handover announced in an artifact SIGNED BY THE OUTGOING KEY — so a verifier checking whether a key was authorised at the moment of issuance can establish it rather than take our word. That is the temporal-durability gap the x402 offer-receipt documentation names, and it was built here for our own reasons before the extension was on our radar.",
        in_service_from: currentKeyInServiceFrom(publicKey),
        retired_keys: retiredKeysFor(publicKey).map((entry) => ({
          public_key_hex: entry.public_key,
          in_service_from: entry.in_service_from,
          retired_on: entry.retired_on,
          handover: `${base}/api/verify/${entry.announcement_id}`,
        })),
        /**
         * NOT LISTED AS A verificationMethod, deliberately. That array
         * means "authorised now," and a retired key is not. Putting it
         * there to be helpful would tell a verifier the old key can
         * still sign for us, which is the opposite of what retiring it
         * meant.
         */
        retired_keys_note:
          "Retired keys are recorded here and never listed under verificationMethod, because that array means authorised NOW and a retired key is not. What a retired key can still do is verify what it signed while it was in service, which is what the dates are for.",
        what_this_key_signs: `${base}/attestation`,
        trust: `${base}/.well-known/trust.json`,
      },
    },
    200,
    { "Content-Type": "application/did+json" },
  );
});
