import { Hono } from "hono";
import { signMessage } from "@/lib/signing";
import { STORE_METADATA } from "@/store";
import {
  TRUST_LIST_ATTESTS,
  TRUST_LIST_ENTRIES,
  TRUST_LIST_V0_NOTE,
} from "@/store/trust-list";
import type { HonoEnv } from "@/types";

/**
 * GET /trust-list.json — the signed trust list, v0.
 *
 * Mechanism first: a working, verifiable artifact at a stable URL and
 * nothing else. No storefront section, no pitch, no page explaining
 * why it matters. If it turns out to matter, that will be because
 * agents used it, not because we said so.
 *
 * The signature covers the canonical JSON of the list body, so any
 * reader can confirm the LIST ITSELF was issued by this store and not
 * assembled by whoever handed it to them. Same key as every
 * certificate; same public key at /.well-known/scvd-signing-key.
 */
export const trustListRoutes = new Hono<HonoEnv>();

export const TRUST_LIST_PATH = "/trust-list.json";
export const TRUST_LIST_VERSION = 0;

trustListRoutes.get(TRUST_LIST_PATH, async (c) => {
  const base = c.env.STORE_BASE_URL;
  // The signed payload: everything a reader would act on. Signature
  // and key ride outside it, because a signature cannot cover itself.
  const body = {
    version: TRUST_LIST_VERSION,
    issuer: STORE_METADATA.name,
    issuer_origin: base,
    issued_at: new Date().toISOString(),
    attests: TRUST_LIST_ATTESTS,
    note: TRUST_LIST_V0_NOTE,
    entries: TRUST_LIST_ENTRIES.map((entry) => ({ ...entry })),
  };
  const canonical = JSON.stringify(body);
  const { signature, publicKey } = await signMessage(
    canonical,
    c.env.SIGNING_KEY,
  );
  return c.json(
    {
      ...body,
      signature,
      public_key: publicKey,
      signature_covers:
        "The canonical JSON of every field above signature, in the order served. Re-serialize them and check against the ed25519 public key here or at /.well-known/scvd-signing-key.",
    },
    200,
    { "Cache-Control": "no-store" },
  );
});
