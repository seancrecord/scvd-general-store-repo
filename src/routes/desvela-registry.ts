import { Hono } from "hono";
import { DESVELA_REGISTRY_BODY_LIMIT, DESVELA_REGISTRY_USER_AGENT, isDesvelaRegistryPayload, recordDesvelaRegistry } from "@/services/desvela-registry";
import type { HonoEnv } from "@/types";

export const desvelaRegistryRoutes = new Hono<HonoEnv>();

/** Preserve the signed bytes and bound the read without trusting Content-Length. */
async function readBody(request: Request): Promise<Uint8Array<ArrayBuffer> | null> {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > DESVELA_REGISTRY_BODY_LIMIT) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}

// Private partner ingress, documented in docs/DESVELA_REGISTRY_WATCH.md.
// No public capability is added to the shopping or discovery catalogs.
desvelaRegistryRoutes.post("/webhooks/desvela-registry", async (c) => {
  c.header("Cache-Control", "no-store");
  const secret = c.env.DESVELA_REGISTRY_SECRET;
  const hex = /^hmac-sha256=([a-fA-F0-9]{64})$/.exec(c.req.header("X-Desvela-Signature") ?? "")?.[1];
  if (!secret || !hex) return c.json({ error: "Unauthorized webhook." }, 401);
  const raw = await readBody(c.req.raw);
  if (raw === null) return c.json({ error: "Webhook body too large." }, 413);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const signature = Uint8Array.from(hex.match(/../g)!, (byte) => Number.parseInt(byte, 16));
  // WebCrypto performs the HMAC comparison in constant time, as on
  // the existing trade counter. Never parse and reserialize to verify.
  if (!await crypto.subtle.verify("HMAC", key, signature, raw)) return c.json({ error: "Unauthorized webhook." }, 401);
  const userAgentMatches = c.req.header("User-Agent") === DESVELA_REGISTRY_USER_AGENT;
  if (!userAgentMatches) console.warn("desvela_registry_user_agent_mismatch");
  let rawBody: string;
  let payload: unknown;
  try {
    rawBody = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(raw);
    payload = JSON.parse(rawBody);
  } catch { return c.json({ error: "Webhook must contain UTF-8 JSON." }, 400); }
  if (!isDesvelaRegistryPayload(payload, new URL(c.env.STORE_BASE_URL).hostname)) {
    return c.json({ error: "Invalid registry report for this store." }, 400);
  }
  try {
    // The receipt is essential, not deferred decoration: 200 must mean
    // it was saved. A failed write leaves the sender able to retry.
    const receipt = await recordDesvelaRegistry(c.env, payload, raw, rawBody, userAgentMatches);
    return c.json({ accepted: true, receipt });
  } catch {
    console.error("desvela_registry_receipt_write_failed");
    return c.json({ error: "Registry report was not saved. Retry delivery." }, 503);
  }
});
