import { ardManifest, type ArdManifest } from "@/lib/ard-catalog";
import { jcsCanonicalize } from "@/lib/jcs";
import { sha256Hex } from "@/lib/idempotency";
import { signDetachedJws } from "@/lib/offer-receipt";
import { ardTrustDeclaration } from "@/store/ard-trust";
import type { Env } from "@/types";

export async function signedArdManifest(env: Env): Promise<ArdManifest> {
  const manifest = ardManifest(env.STORE_BASE_URL);
  // Bind the catalog without a circular signature preimage. Omit only
  // the trust envelopes at their defined locations; every other field
  // (including both type spellings) remains in the signed commitment.
  const { trustManifest: hostTrust, ...host } = manifest.host;
  const content = {
    ...manifest,
    host,
    entries: manifest.entries.map(({ trustManifest: entryTrust, ...entry }) => entry),
  };
  const sourceDigest = `sha256:${await sha256Hex(jcsCanonicalize(content))}`;
  const declaration = ardTrustDeclaration(env.STORE_BASE_URL, sourceDigest);
  const trustManifest = {
    ...declaration,
    signature: await signDetachedJws(env, jcsCanonicalize(declaration)),
  };
  // Registries extract entries; signing only the transport envelope
  // would lose the evidence at the first indexing hop. One signing
  // operation, identical trust bytes on every entry, no KV or network.
  return {
    ...manifest,
    host: { ...manifest.host, trustManifest },
    entries: manifest.entries.map((entry) => ({ ...entry, trustManifest })),
  };
}
