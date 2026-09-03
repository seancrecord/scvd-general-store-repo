/**
 * THE TRADE COUNTER'S LOCK — verifying a marketplace's signed
 * instruction (2026-09-03).
 *
 * WHAT THIS IS. A marketplace that resells this shelf collects its
 * customer's money itself, off-chain from our view, and then calls
 * us. There is no payment on that call to verify, so the till's whole
 * question — "did money move?" — has no answer here. What CAN be
 * checked is that the instruction came from the account we opened,
 * has not been altered, is recent, and has not been presented
 * before. This file answers exactly those four and nothing else.
 *
 * THE SCHEME IS BOILERPLATE, ON PURPOSE. HMAC-SHA256 over a timestamp,
 * a nonce and the exact request body is the shape Stripe, GitHub,
 * Shopify and Twilio all sign their webhooks in. Marketplaces differ
 * in the DETAILS — header names, the order of the signed string,
 * seconds versus milliseconds, whether a separate provider key
 * travels alongside — and every one of those details is a field on a
 * TradeDialect rather than a branch in this code. The first account
 * (store/trade-counter.ts) is one dialect row; the next one is
 * another row, not another file.
 *
 * PURE. No KV, no bindings, no clock of its own: the caller passes
 * `now_ms`, so a test can stand at any moment (AGENTS.md: a verdict
 * that moves with the wall clock is not a test). Replay protection is
 * NOT here — this file says whether the signature is good and hands
 * back the replay key; services/trade-nonces.ts decides whether that
 * key has been seen, on a store that can actually answer.
 *
 * FAILURES ARE NAMED AND NOTHING ELSE. Every refusal carries a code
 * and no detail: which header was wrong, which secret matched, how
 * far off the clock was — none of it leaves this function, because
 * every one of those is a hint to whoever is guessing.
 */

/**
 * What the partner signs, in order. Two shapes cover the industry:
 * `timestamp.nonce.body` (the first account's, with explicit replay
 * protection) and `timestamp.body` (Stripe's shape, where the
 * timestamp plus the body IS the replay key). A body-only dialect is
 * deliberately not offered: with no timestamp there is no window,
 * and with no window a captured request is good forever.
 */
export type TradeSigningString = "timestamp.nonce.body" | "timestamp.body";

export interface TradeDialect {
  id: string;
  name: string;
  /**
   * The header carrying a provider key, where the partner's scheme
   * sends one. Checked in constant time against the partner's
   * TRADE_PROVIDER_KEY secret. A ROUTING LABEL, not the credential:
   * it travels in the clear on every request, so even where it is a
   * distinct secret it is worth less than the signature beside it,
   * and where a partner uses ONE value for both it is worth nothing
   * at all. The HMAC is the lock; this is the name on the door.
   */
  provider_key_header?: string;
  timestamp_header: string;
  /** Required by `timestamp.nonce.body`; ignored by `timestamp.body`. */
  nonce_header?: string;
  signature_header: string;
  /** e.g. "sha256=" — stripped before the hex is read. Empty for bare hex. */
  signature_prefix: string;
  signing_string: TradeSigningString;
  timestamp_unit: "seconds" | "milliseconds";
  /** The nonce's exact shape; a nonce that does not match is refused. */
  nonce_pattern?: RegExp;
  /** How old (or how far ahead) a timestamp may be, in seconds. */
  window_seconds: number;
}

export interface TradeSecrets {
  /** The signing secret in service. */
  signing: string;
  /**
   * The outgoing secret during a rotation. Kid-less HMAC schemes
   * cannot say which key signed, so the only cutover without a dead
   * minute is to accept both and log which one matched — then unset
   * the old one when the partner confirms the switch.
   */
  previous?: string;
  /** Present only when the dialect carries a provider key header. */
  provider_key?: string;
}

export type TradeAuthFailure =
  | "missing_headers"
  | "bad_provider_key"
  | "bad_timestamp"
  | "stale_timestamp"
  | "bad_nonce"
  | "bad_signature";

export interface TradeAuthOk {
  ok: true;
  timestamp_ms: number;
  /**
   * The replay key the nonce store is asked about: the nonce itself
   * where the dialect carries one, else the instruction digest — an
   * exact replay of a `timestamp.body` request has the same digest.
   */
  replay_key: string;
  /** sha256 hex of the exact signed string. Bound into the certificate. */
  instruction_digest: string;
  signed_with: "current" | "previous";
}

export interface TradeAuthFail {
  ok: false;
  code: TradeAuthFailure;
}

export type TradeAuthVerdict = TradeAuthOk | TradeAuthFail;

const HEX_64 = /^[0-9a-f]{64}$/;
const DIGITS = /^[0-9]{1,16}$/;

const encoder = new TextEncoder();

export function tradeSigningString(
  dialect: Pick<TradeDialect, "signing_string">,
  timestamp: string,
  nonce: string | undefined,
  body: string,
): string {
  return dialect.signing_string === "timestamp.nonce.body"
    ? `${timestamp}.${nonce ?? ""}.${body}`
    : `${timestamp}.${body}`;
}

function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let index = 0; index < out.length; index += 1) {
    out[index] = parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return out;
}

export async function sha256Hex(text: string): Promise<string> {
  return bytesToHex(await crypto.subtle.digest("SHA-256", encoder.encode(text)));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function hmacSha256Hex(
  secret: string,
  message: string,
): Promise<string> {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret),
    encoder.encode(message),
  );
  return bytesToHex(signature);
}

/**
 * Constant-time equality over bytes. The loop runs the full length
 * of the longer input whatever the first mismatch, so the time taken
 * says nothing about WHERE two values diverge. Used for the provider
 * key; the signature itself goes through WebCrypto's own verify,
 * which is constant-time by construction.
 */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let index = 0; index < length; index += 1) {
    diff |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return diff === 0;
}

async function hmacMatches(
  secret: string,
  message: string,
  signatureHex: string,
): Promise<boolean> {
  return crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    hexToBytes(signatureHex),
    encoder.encode(message),
  );
}

export interface VerifyTradeRequestInput {
  dialect: TradeDialect;
  /** Header lookup, case-insensitive, as the framework provides it. */
  header: (name: string) => string | undefined;
  /** The EXACT bytes received, as text. Never a re-serialisation. */
  rawBody: string;
  secrets: TradeSecrets;
  now_ms: number;
}

/**
 * The four checks, in the order that leaks least: cheap shape
 * refusals first, the provider key, the clock, then the HMAC last —
 * so a caller with no secret never learns anything about the clock
 * from a response that took the HMAC path.
 */
export async function verifyTradeRequest(
  input: VerifyTradeRequestInput,
): Promise<TradeAuthVerdict> {
  const { dialect, header, rawBody, secrets } = input;

  const timestampRaw = header(dialect.timestamp_header)?.trim();
  const signatureRaw = header(dialect.signature_header)?.trim();
  const nonceRaw = dialect.nonce_header
    ? header(dialect.nonce_header)?.trim()
    : undefined;
  const providerKeyRaw = dialect.provider_key_header
    ? header(dialect.provider_key_header)?.trim()
    : undefined;

  if (!timestampRaw || !signatureRaw) {
    return { ok: false, code: "missing_headers" };
  }
  if (dialect.provider_key_header && !providerKeyRaw) {
    return { ok: false, code: "missing_headers" };
  }
  if (dialect.signing_string === "timestamp.nonce.body" && !nonceRaw) {
    return { ok: false, code: "missing_headers" };
  }

  if (dialect.provider_key_header) {
    const expected = secrets.provider_key ?? "";
    if (
      expected.length === 0 ||
      !timingSafeEqual(
        encoder.encode(providerKeyRaw ?? ""),
        encoder.encode(expected),
      )
    ) {
      return { ok: false, code: "bad_provider_key" };
    }
  }

  if (!DIGITS.test(timestampRaw)) {
    return { ok: false, code: "bad_timestamp" };
  }
  const timestampValue = Number(timestampRaw);
  const timestampMs =
    dialect.timestamp_unit === "seconds" ? timestampValue * 1000 : timestampValue;
  /*
   * SYMMETRIC WINDOW. The published rule is "older than N minutes is
   * refused"; a timestamp N minutes in the FUTURE is refused by the
   * same rule, because a clock that far ahead is either a bug we
   * want surfaced or a request minted to be replayed later.
   */
  if (Math.abs(input.now_ms - timestampMs) > dialect.window_seconds * 1000) {
    return { ok: false, code: "stale_timestamp" };
  }

  if (dialect.signing_string === "timestamp.nonce.body") {
    const pattern = dialect.nonce_pattern ?? /^[0-9a-f]{32}$/i;
    if (!nonceRaw || !pattern.test(nonceRaw)) {
      return { ok: false, code: "bad_nonce" };
    }
  }

  if (!signatureRaw.startsWith(dialect.signature_prefix)) {
    return { ok: false, code: "bad_signature" };
  }
  const signatureHex = signatureRaw
    .slice(dialect.signature_prefix.length)
    .toLowerCase();
  if (!HEX_64.test(signatureHex)) {
    return { ok: false, code: "bad_signature" };
  }

  const message = tradeSigningString(dialect, timestampRaw, nonceRaw, rawBody);
  let signedWith: TradeAuthOk["signed_with"] | null = null;
  if (secrets.signing.length > 0 && (await hmacMatches(secrets.signing, message, signatureHex))) {
    signedWith = "current";
  } else if (
    secrets.previous &&
    secrets.previous.length > 0 &&
    (await hmacMatches(secrets.previous, message, signatureHex))
  ) {
    signedWith = "previous";
  }
  if (signedWith === null) {
    return { ok: false, code: "bad_signature" };
  }

  const instructionDigest = await sha256Hex(message);
  return {
    ok: true,
    timestamp_ms: timestampMs,
    replay_key: nonceRaw ?? instructionDigest,
    instruction_digest: instructionDigest,
    signed_with: signedWith,
  };
}

/**
 * THE REFERENCE CLIENT — what a partner's backend has to do, in code
 * rather than prose, and the same function the tests sign with. A
 * partner reading /trade can copy this line for line; a partner
 * whose own signer disagrees with it has found the bug on one side
 * or the other before any money is involved.
 */
export async function signTradeRequest(input: {
  dialect: TradeDialect;
  secret: string;
  body: string;
  provider_key?: string;
  now_ms?: number;
  nonce?: string;
}): Promise<Record<string, string>> {
  const { dialect } = input;
  const now = input.now_ms ?? Date.now();
  const timestamp = String(
    dialect.timestamp_unit === "seconds" ? Math.floor(now / 1000) : now,
  );
  const nonce =
    dialect.signing_string === "timestamp.nonce.body"
      ? (input.nonce ?? bytesToHex(crypto.getRandomValues(new Uint8Array(16))))
      : undefined;
  const signature = await hmacSha256Hex(
    input.secret,
    tradeSigningString(dialect, timestamp, nonce, input.body),
  );
  const headers: Record<string, string> = {
    "content-type": "application/json",
    [dialect.timestamp_header]: timestamp,
    [dialect.signature_header]: `${dialect.signature_prefix}${signature}`,
  };
  if (dialect.nonce_header && nonce !== undefined) {
    headers[dialect.nonce_header] = nonce;
  }
  if (dialect.provider_key_header && input.provider_key !== undefined) {
    headers[dialect.provider_key_header] = input.provider_key;
  }
  return headers;
}
