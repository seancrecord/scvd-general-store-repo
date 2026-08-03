import { cachedPublicKeyHex } from "@/lib/signing";
import {
  currentKeyInServiceFrom,
  retiredKeysFor,
} from "@/store/key-registry";
import type { Env } from "@/types";

/**
 * THE DID DOCUMENT AS DATA, extracted from the route on 2026-08-03 so
 * a second consumer could exist — and the second consumer is the
 * conformance desk checking OUR OWN artifacts.
 *
 * Why the desk cannot just fetch it: Cloudflare refuses a Worker's
 * subrequest to its own hostname. The fetch goes out, hits the edge,
 * gets routed back toward the same Worker, and dies as a 522 — while
 * the identical request from anywhere else on earth answers in 60ms.
 * So the one issuer whose did:web the desk could never resolve was
 * the issuer operating the desk, and the flagship free trust-check
 * answered does_not_conform on our own live, valid offers.
 *
 * The desk therefore reads this builder directly when the DID's host
 * is its own. Same producer as the route, byte-for-byte the same
 * document, no second copy to go stale — the property this store
 * rebuilt five surfaces in one day to get.
 */
export async function buildDidDocument(env: Env): Promise<object> {
  const base = env.STORE_BASE_URL;
  const domain = new URL(base).host;
  const did = `did:web:${domain}`;
  const publicKey = await cachedPublicKeyHex(env.SIGNING_KEY);
  /**
   * THE KID NAMES THE KEY, NOT THE SLOT — the keeper's catch, hours
   * after this shipped as a hardcoded #key-1. A slot name is a kid
   * that silently repoints on rotation: every receipt signed today
   * would then carry an identifier resolving to a DIFFERENT key, and
   * verification would not merely find no record — it would find the
   * wrong key and FAIL. So the fragment is derived from the registry:
   * this store's current key is its (retired + 1)th, permanently,
   * and the next key gets the next number rather than inheriting
   * this one's name.
   */
  const retired = retiredKeysFor(publicKey);
  const kid = `${did}#key-${retired.length + 1}`;

  return {
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
      retired_keys: retired.map((entry, index) => ({
        /** Permanent: the Nth key this store ever held keeps #key-N. */
        kid: `${did}#key-${index + 1}`,
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
  };
}

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
