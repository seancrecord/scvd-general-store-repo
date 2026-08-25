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
  const headers = curatedHeaders(response.headers);
  const body = await readBoundedBody(response, limit);
  const bodySha256 = body.truncated
    ? null
    : hex(await crypto.subtle.digest("SHA-256", body.bytes));
  return {
    challenge_bytes: response.headers.get("payment-required"),
    headers,
    body_sha256: bodySha256,
    body_bytes: body.bytesRead,
    body_truncated: body.truncated,
  };
}
