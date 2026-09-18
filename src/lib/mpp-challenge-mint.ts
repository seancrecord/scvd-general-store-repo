import { getAddress } from "viem";
import { USDC_DECIMALS } from "@/lib/payments";
import { nativeCheckoutTerms } from "@/lib/purchase-capabilities";
import { nativeCheckoutItem, nativeChallengeMintable } from "@/lib/mpp-checkout-capability";
import { httpArtifactDigest } from "@/lib/artifact-checkpoint";
import { suggestedIdempotencyKey, usableIdempotencyKey } from "@/lib/idempotency";
import type { Env } from "@/types";

/**
 * THE CHALLENGE, MINTED WITHOUT THE SETTLEMENT SDK (whole store,
 * 2026-09-18). The store mints its native challenge through the SDK's
 * server and its EVM charge method (lib/mpp-evm-adapter.ts), which
 * carry viem, zod and the settlement path; the doors Worker cannot
 * afford any of it (scripts/cold-local.mjs holds the doors under one
 * megabyte, and the SDK's entry alone put it 400 KB over). What a
 * challenge IS, though, is small, and the draft says so: realm,
 * method, intent, the charge request, an expiry, the bound meta, and
 * an HMAC-SHA256 id over the seven slots of that under the challenge
 * key, serialized as one `Payment` auth header. This is that, in
 * eighty lines, built from the same terms the store's charge method
 * would build, so the doors' header and the store's header are the
 * same bytes under the same clock and key.
 *
 * test/doors-parity.spec.ts holds that equality against the SDK's own
 * output, every door, and it is the only proof that matters: the
 * store validates a credential against a challenge it re-derives from
 * these same terms, so a byte the doors get wrong is a credential the
 * store refuses. A Worker without a usable key mints nothing and says
 * so; the doors then hand the knock to the store, which has one.
 */

/** ox's Json.canonicalize, which the SDK serializes the request and meta with: sorted keys, no undefined. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Cannot canonicalize non-finite number");
    return Object.is(value, -0) ? "0" : JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.keys(value as Record<string, unknown>).sort().flatMap((key) => {
      const inner = (value as Record<string, unknown>)[key];
      return inner === undefined ? [] : [`${JSON.stringify(key)}:${canonicalJson(inner)}`];
    });
    return `{${entries.join(",")}}`;
  }
  throw new TypeError("Cannot canonicalize value");
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The SDK's PaymentRequest.serialize: canonical JSON, base64url, no padding. */
const serializeRequest = (value: unknown): string => base64Url(new TextEncoder().encode(canonicalJson(value)));

/** The SDK's quoted-string parameter, escaped the same way. */
function authParam(name: string, value: string): string {
  if (/[\r\n]/.test(value)) throw new Error("Invalid quoted-string value.");
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/[Ā-￿]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
  return `${name}="${escaped}"`;
}

/** The SDK refuses a key under 32 bytes; the doors refuse to mint with one rather than mint what the store cannot verify. */
export const MIN_CHALLENGE_KEY_BYTES = 32;

export async function mintNativeChallenge(env: Env, url: string, suppliedKey: string | undefined): Promise<string | null> {
  const path = new URL(url).pathname;
  const item = nativeCheckoutItem(path, "GET");
  if (!item || !nativeChallengeMintable(env, path, "GET")) return null;
  const secret = new TextEncoder().encode(env.MPP_CHALLENGE_KEY!);
  if (secret.length < MIN_CHALLENGE_KEY_BYTES) return null;
  if (suppliedKey !== undefined && !usableIdempotencyKey(suppliedKey)) return null;
  const purchaseKey = suppliedKey ?? suggestedIdempotencyKey(item.id);
  const terms = nativeCheckoutTerms(env, item);
  // The charge method's request, as its schema emits it: atomic amount,
  // checksummed addresses, the chain and the credential type it takes.
  const request = serializeRequest({
    amount: terms.amount,
    currency: getAddress(terms.asset),
    methodDetails: { chainId: Number(terms.network.split(":")[1]), credentialTypes: ["authorization"], decimals: USDC_DECIMALS },
    recipient: getAddress(terms.payTo),
  });
  // The store's binding, then the SDK's own scope slot.
  const opaque = serializeRequest({ request_digest: await httpArtifactDigest(url), purchase_key: purchaseKey, _mppx_scope: path });
  const realm = new URL(env.STORE_BASE_URL).host;
  const expires = new Date(Date.now() + terms.maxTimeoutSeconds * 1000).toISOString();
  // §5.1.2.1.1: realm | method | intent | request | expires | digest | opaque, digest empty.
  const binding = [realm, "evm", "charge", request, expires, "", opaque].join("|");
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const id = base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(binding))));
  return `Payment ${[
    authParam("id", id), authParam("realm", realm), authParam("method", "evm"), authParam("intent", "charge"),
    authParam("request", request), authParam("expires", expires), authParam("opaque", opaque),
  ].join(", ")}`;
}

/** The same headers the store's own attach sets beside the challenge. */
export function attachNativeChallengeHeaders(response: Response, header: string): void {
  response.headers.set("WWW-Authenticate", header);
  response.headers.set("Cache-Control", "no-store");
  response.headers.append("Vary", "Authorization, Idempotency-Key");
}
