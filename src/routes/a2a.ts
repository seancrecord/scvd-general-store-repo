import { a2aVersion, a2aVersionError, A2A_CURRENT_VERSION } from "@/lib/a2a-version";
import { handleA2aV1Request } from "@/services/a2a-v1";
import { Hono } from "hono";
import { a2aDoc, handleA2aRequest } from "@/services/a2a-evidence";
import type { HonoEnv } from "@/types";
import { A2A_REQUEST_MAX_BYTES } from "@/services/a2a-tasks";

/**
 * /a2a — the evidence agent's task endpoint (2026-09-03, roadmap A2).
 * GET serves the door's own document; POST is JSON-RPC 2.0,
 * A2A-Version selects v1 or bounded legacy 0.3. Both bind the same
 * evidence tasks and immutable results; GET documents the chosen dialect.
 */
export const a2aRoutes = new Hono<HonoEnv>();

a2aRoutes.use("/a2a", async (c, next) => {
  c.header("Vary", "A2A-Version", { append: true });
  const version = a2aVersion(c.req.header("A2A-Version"));
  if (version) c.header("A2A-Version", version);
  await next();
});

a2aRoutes.get("/a2a", (c) => {
  const version = a2aVersion(c.req.header("A2A-Version"));
  return version ? c.json(a2aDoc(c.env.STORE_BASE_URL, version)) : c.json(a2aVersionError(), 400);
});

a2aRoutes.post("/a2a", async (c) => {
  c.header("Cache-Control", "no-store");
  // Count streamed bytes too: Content-Length is not a trustworthy bound.
  const reader = c.req.raw.body?.getReader();
  let bytes = 0;
  let text = "";
  const decoder = new TextDecoder();
  let body: unknown;
  try {
    if (reader) {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > A2A_REQUEST_MAX_BYTES) {
          await reader.cancel();
          return c.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: `Request exceeds ${A2A_REQUEST_MAX_BYTES} bytes.` } }, 413);
        }
        text += decoder.decode(chunk.value, { stream: true });
      }
    }
    body = JSON.parse(text + decoder.decode());
  } catch {
    return c.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error: the body must be JSON-RPC 2.0." } }, 400);
  } finally {
    reader?.releaseLock();
  }
  const version = a2aVersion(c.req.header("A2A-Version"));
  if (!version) return c.json(a2aVersionError(typeof body === "object" && body !== null && "id" in body ? body.id : null), 400);
  const answer = await (version === A2A_CURRENT_VERSION ? handleA2aV1Request : handleA2aRequest)(c.env, body);
  return c.json(answer.body, answer.status as 200, { "Cache-Control": "no-store" });
});
