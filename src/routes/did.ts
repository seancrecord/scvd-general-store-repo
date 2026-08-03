import { Hono } from "hono";
import { buildDidDocument } from "@/services/did-document";
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
 * DERIVED FROM THE LIVE SECRET AND THE REGISTRY, never typed, and
 * since 2026-08-03 built in services/did-document.ts rather than here
 * — because the conformance desk needs the same document and cannot
 * fetch this route: Cloudflare refuses a Worker's subrequest to its
 * own hostname (it 522s), so checking OUR OWN artifacts requires
 * reading the builder directly. Route and desk share one producer and
 * are incapable of disagreeing, which is the same property that puts
 * the key itself behind one cached derivation.
 *
 * THE PART WORTH SAYING OUT LOUD, because the extension's own
 * documentation names it as unsolved: a DID document is MUTABLE and
 * current-state only. Remove a key during rotation and there is no
 * record it was ever authorised, so a receipt signed under the old key
 * becomes unverifiable to anyone checking afterwards. Their table
 * lists on-chain attestation services as the only approach with
 * temporal durability. This store publishes that half at key_history,
 * and the document points at it — see services/did-document.ts.
 */
export const didRoutes = new Hono<HonoEnv>();

didRoutes.get("/.well-known/did.json", async (c) => {
  return c.json(await buildDidDocument(c.env), 200, {
    "Content-Type": "application/did+json",
  });
});
