import type { MiddlewareHandler } from "hono";
import type { HonoEnv } from "@/types";

/**
 * CONDITIONAL GET ON THE PUBLISHED DOCUMENTS — the third leg of
 * "readable by a machine", after the self-describing envelopes and
 * the cross-origin header.
 *
 * This store's whole audience is pollers. The datasets change weekly,
 * /openapi.json changes only when we deploy, and an agent that reads
 * them on a schedule had no way to ask "has it changed?" — every poll
 * was a full re-download of bytes it already held. /openapi.json
 * alone is 1.3MB.
 *
 * The ETag is the SHA-256 of the exact bytes served, which makes it
 * correct by construction: it cannot go stale, because it is not a
 * version number somebody maintains — it is the body. A document
 * whose bytes are identical answers 304 and sends nothing; a document
 * that changed by one character answers 200 with a new tag.
 *
 * It is NOT a signature and this store will never call it one. The
 * digest is the same one any reader computes for themselves, which is
 * exactly what makes it a useful thing to quote back to us and a
 * useless thing to trust us about. The signed artifacts carry
 * ed25519 signatures; those are a different claim entirely.
 *
 * THE BOUNDARY: GET, answered 200, a machine-readable document body,
 * outside /admin, and never on a response marked no-store. Money
 * paths are marked no-store and stay outside — a 304 on a payment
 * challenge would hand a client a stale nonce, which is the one
 * failure this whole idea could cause.
 *
 * WHAT IT DOES NOT REACH, said here rather than left to be
 * rediscovered: a browser-based agent that sets If-None-Match from
 * JavaScript triggers a CORS preflight, because If-None-Match is not
 * a safelisted request header, and this store answers preflights only
 * on the discovery paths. A browser's OWN cache revalidates without
 * one, so the common case works; explicit conditional GET from
 * cross-origin script does not. Server-side agents — which is nearly
 * all of them — have no CORS layer at all and get the whole benefit.
 */

/** The same document class the cross-origin allowance derives. */
const READABLE_DOCUMENT =
  /^(application\/(json|xml|[\w.+-]+\+json)|text\/(markdown|plain|xml))\b/;

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * RFC 9110 §13.1.2: `*`, or a comma-separated list of entity tags.
 * Weak comparison is the right one for a conditional GET — a weak tag
 * we never mint would still match its own strong twin, and that is
 * the direction that cannot cause a wrong answer.
 */
function matchesEtag(header: string | undefined, etag: string): boolean {
  if (!header) return false;
  if (header.trim() === "*") return true;
  const strong = etag.replace(/^W\//, "");
  return header
    .split(",")
    .map((candidate) => candidate.trim().replace(/^W\//, ""))
    .includes(strong);
}

/**
 * A 304 carries no content, so it carries no content length. Every
 * other header stays: RFC 9110 §15.4.5 wants the client to see what
 * it would have seen on the 200.
 */
function strip(headers: Headers): Headers {
  const kept = new Headers(headers);
  kept.delete("Content-Length");
  return kept;
}

export const conditionalGet: MiddlewareHandler<HonoEnv> = async (c, next) => {
  await next();
  if (c.req.method !== "GET") return;
  if (c.req.path.startsWith("/admin")) return;
  if (c.res.status !== 200) return;
  if (c.res.headers.has("ETag")) return;
  const cacheControl = c.res.headers.get("Cache-Control") ?? "";
  if (cacheControl.includes("no-store")) return;
  if (!READABLE_DOCUMENT.test(c.res.headers.get("Content-Type") ?? "")) return;

  const body = await c.res.arrayBuffer();
  const etag = `"${hex(await crypto.subtle.digest("SHA-256", body)).slice(0, 32)}"`;
  const headers = new Headers(c.res.headers);
  headers.set("ETag", etag);
  if (!cacheControl) {
    // MAY be stored, MUST be revalidated. This store publishes dated
    // evidence; a cache serving last week's corpus as this week's is
    // the failure mode that matters, and max-age is how it happens.
    headers.set("Cache-Control", "no-cache");
  }

  if (matchesEtag(c.req.header("If-None-Match"), etag)) {
    c.res = new Response(null, { status: 304, headers: strip(headers) });
    return;
  }
  c.res = new Response(body, { status: 200, headers });
};
