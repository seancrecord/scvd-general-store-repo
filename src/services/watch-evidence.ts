/**
 * RAW EVIDENCE FROM ONE WATCH RESPONSE (roadmap 1.2, B9 / G1).
 *
 * A verdict without the bytes it came from cannot be re-examined
 * after the moment passes. This helper captures the response material
 * the watch already touched, with one hard boundary: hashing a body
 * must never turn a seller-chosen response into an unbounded Worker
 * allocation. Complete bodies at or below the limit get an exact
 * sha256; larger bodies are marked truncated and get no hash that
 * could be mistaken for the digest of the whole response.
 */

export const WATCH_EVIDENCE_BODY_LIMIT_BYTES = 256 * 1024;

/**
 * The response headers retained for later re-examination. The list is
 * intentionally small: PAYMENT-REQUIRED is the battery's input;
 * content metadata explains the bytes; Location explains a manual
 * redirect. Cookies and arbitrary seller headers do not enter the
 * permanent artifact by accident.
 */
const CURATED_RESPONSE_HEADERS = [
  "payment-required",
  "content-type",
  "content-length",
  "location",
  /*
   * 3.1 (ledger G4) — THE INFRASTRUCTURE DIMENSION, from what the
   * probe already touched. Zero extra contact and the same consent
   * posture: these headers arrived in the response we were already
   * reading. Without them an infra migration or a shared-infra
   * cluster leaves no tape, and that tape cannot be reconstructed
   * from a later probe — the server that answered on Tuesday is not
   * available for questioning on Sunday.
   */
  "server",
  "via",
  "x-powered-by",
] as const;

export interface WatchEvidenceCapture {
  /** Exact PAYMENT-REQUIRED header value, before base64 decoding. */
  challenge_bytes: string | null;
  /** Allowlisted response headers, lower-case keys, exact values. */
  headers: Record<string, string>;
  /** SHA-256 of the complete response body, or null when truncated. */
  body_sha256: string | null;
  /** Bytes actually read from the response stream. */
  body_bytes: number;
  /** True when the full response body exceeded the capture ceiling. */
  body_truncated: boolean;
  /**
   * The dimension this vantage cannot reach at all. A Workers `fetch`
   * hands back a Response carrying no certificate detail, so there is
   * no TLS fingerprint to record — and the honest move is to say so
   * on the row rather than leave a reader to assume we looked and
   * found nothing interesting. Absence stated, not implied.
   */
  tls: "unavailable-from-this-vantage";
}

/**
 * 3.1 (ledger G3) — KEY IDENTITY, FREE NOW AND UNCOLLECTABLE LATER.
 *
 * Signed offers carry a `kid`. The round recorded only THAT offers
 * existed, which threw away the ecosystem's only possible
 * key-rotation history — who signs for this host, and since when —
 * once a week, permanently. A key that rotated on Tuesday leaves no
 * trace by Sunday; no later probe can reconstruct it.
 *
 * Reads the kid out of each offer's JWS header without verifying
 * anything: this is an observation about what the door presented,
 * never a claim that the signature is good. Order preserved,
 * duplicates dropped, and a malformed signature costs only itself.
 */
export function signerKidsFromChallenge(
  challengeBytes: string | null | undefined,
): string[] {
  if (!challengeBytes) return [];
  let challenge: Record<string, unknown>;
  try {
    challenge = JSON.parse(atob(challengeBytes)) as Record<string, unknown>;
  } catch {
    return [];
  }
  const extensions = (challenge["extensions"] ?? {}) as Record<string, unknown>;
  const block = extensions["offer-receipt"] as
    | { info?: { offers?: { signature?: unknown }[] } }
    | undefined;
  const offers = block?.info?.offers;
  if (!Array.isArray(offers)) return [];
  const kids: string[] = [];
  for (const offer of offers) {
    if (typeof offer?.signature !== "string") continue;
    const header = offer.signature.split(".")[0];
    if (!header) continue;
    try {
      const parsed = JSON.parse(
        atob(header.replace(/-/g, "+").replace(/_/g, "/")),
      ) as { kid?: unknown };
      if (typeof parsed.kid === "string" && parsed.kid && !kids.includes(parsed.kid)) {
        kids.push(parsed.kid);
      }
    } catch {
      // One unreadable signature loses only itself.
    }
  }
  return kids;
}

function curatedHeaders(headers: Headers): Record<string, string> {
  const retained: Record<string, string> = {};
  for (const name of CURATED_RESPONSE_HEADERS) {
    const value = headers.get(name);
    if (value !== null) retained[name] = value;
  }
  return retained;
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function readBoundedBody(
  response: Response,
  limit: number,
): Promise<{
  bytes: Uint8Array;
  bytesRead: number;
  truncated: boolean;
}> {
  if (!response.body) {
    return { bytes: new Uint8Array(), bytesRead: 0, truncated: false };
  }

  const declared = response.headers.get("content-length");
  if (declared !== null) {
    const declaredBytes = Number(declared);
    if (Number.isFinite(declaredBytes) && declaredBytes > limit) {
      await response.body.cancel("watch evidence body exceeds capture limit");
      return { bytes: new Uint8Array(), bytesRead: 0, truncated: true };
    }
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytesRead += part.value.byteLength;
      if (bytesRead > limit) {
        await reader.cancel("watch evidence body exceeds capture limit");
        return { bytes: new Uint8Array(), bytesRead, truncated: true };
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(bytesRead);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes: body, bytesRead, truncated: false };
}

export async function captureWatchEvidence(
  response: Response,
  limit = WATCH_EVIDENCE_BODY_LIMIT_BYTES,
): Promise<WatchEvidenceCapture> {
  const { evidence } = await captureWatchEvidenceKeepingBody(response, limit);
  return evidence;
}

/**
 * THE SAME CAPTURE, FOR A CALLER THAT STILL NEEDS THE BODY.
 *
 * The launch check (roadmap 1.2, ledger I5) reads the challenge
 * response's body twice — the non-402 preview and the JSON-challenge
 * fallback — so a capture that consumed the stream would starve the
 * walk it is trying to evidence. This variant hands the decoded text
 * back BESIDE the capture, never inside it: the capture object is
 * what rides into signed rows, and a full body inside signed bytes
 * would balloon every producer that stores one.
 *
 * `bodyText` is the bytes actually read, decoded. On a truncated
 * body it is EMPTY — readBoundedBody discards partial reads rather
 * than keep an unbounded buffer alive — so an oversized challenge
 * fails to parse the same way it fails to hash, and a preview of a
 * quarter-megabyte body is honestly absent rather than misleadingly
 * partial.
 */
export async function captureWatchEvidenceKeepingBody(
  response: Response,
  limit = WATCH_EVIDENCE_BODY_LIMIT_BYTES,
): Promise<{ evidence: WatchEvidenceCapture; bodyText: string }> {
  const headers = curatedHeaders(response.headers);
  const body = await readBoundedBody(response, limit);
  const bodySha256 = body.truncated
    ? null
    : hex(await crypto.subtle.digest("SHA-256", body.bytes));
  return {
    evidence: {
      challenge_bytes: response.headers.get("payment-required"),
      headers,
      body_sha256: bodySha256,
      body_bytes: body.bytesRead,
      body_truncated: body.truncated,
      tls: "unavailable-from-this-vantage",
    },
    bodyText: new TextDecoder().decode(body.bytes),
  };
}
