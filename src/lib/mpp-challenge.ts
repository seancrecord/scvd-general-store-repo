import { jcsCanonicalize } from "@/lib/jcs";

/**
 * THE SECOND WIRE, READ (roadmap V3 PR 1, 2026-09-04; design in
 * docs/MPP_READ_ONLY_2026-09.md). The Machine Payments Protocol puts
 * its challenge on `WWW-Authenticate: Payment …` — one field-value per
 * challenge, RFC 9110 auth-params, the `request` a base64url of
 * JCS-canonical JSON. This file parses that and nothing more: no
 * credential, no receipt, no payment. Every wire fact is from
 * github.com/tempoxyz/mpp-specs at main on 2026-09-03 (`[spec]`).
 *
 * THE PARSER FOLLOWS RFC 9110, not a split on commas: a comma inside a
 * quoted `description` is the trap the design names, and the Workers
 * runtime joins repeated header values with ", ", so one string can
 * carry several challenges of several schemes. The reader keys on the
 * `Payment` scheme token only — a proxy's `Basic` beside a door's
 * PAYMENT-REQUIRED is not MPP.
 */

export const MPP_BATTERY = "mpp-v1";
/** The draft this battery read; a change re-versions it, never edits it. */
export const MPP_SPEC_DRAFT = "draft-00";

/** The methods the spec repository holds a draft for, at main 2026-09-03. */
export const MPP_METHODS = ["card", "evm", "hedera", "lightning", "nearintents", "solana", "stellar", "stripe", "tempo", "usdc"] as const;
/** The intents with a draft. `session` is advertised in the wild and has none. */
export const MPP_INTENTS = ["charge", "subscription"] as const;
/** Intents seen in implementers' docs with no draft: not a failure, a buyer holding only the registry cannot pay them. */
export const MPP_INTENTS_UNREGISTERED_BUT_SEEN = ["session"] as const;
/** Problem Details types under https://paymentauth.org/problems/. */
export const MPP_PROBLEM_TYPES = ["payment-required", "payment-insufficient", "payment-expired", "verification-failed", "method-unsupported", "malformed-credential", "invalid-challenge"] as const;
export const MPP_PROBLEM_TYPE_PREFIX = "https://paymentauth.org/problems/";
/** Tempo chain ids `[impl]`: mainnet 4217; Moderato, the testnet, 42431 — and the DEFAULT when chainId is absent. */
export const TEMPO_MAINNET_CHAIN_ID = 4217;
export const TEMPO_TESTNET_CHAIN_ID = 42431;
/** Methods whose request MUST name a recipient the credential's `to` matches. */
export const MPP_METHODS_NEEDING_RECIPIENT = ["evm", "tempo", "solana"] as const;

export interface AuthChallenge {
  scheme: string;
  /** Lower-cased names; values unquoted and unescaped. */
  params: Record<string, string>;
  /** A bare token68 (Basic's, Bearer's), when the challenge carried one instead of params. */
  token68?: string;
}

const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

/**
 * RFC 9110 §11.6.1 credentials/challenge grammar over one header
 * value (possibly several field-values joined by ", "). Quoted strings
 * are honoured, including escaped quotes and commas inside them.
 */
export function parseWwwAuthenticate(value: string | null | undefined): AuthChallenge[] {
  if (!value) return [];
  const items = splitOutsideQuotes(value, ",").map((item) => item.trim()).filter((item) => item.length > 0);
  const challenges: AuthChallenge[] = [];
  let current: AuthChallenge | null = null;
  for (const item of items) {
    const param = readParam(item);
    if (param && current && !item.includes(" ")) {
      current.params[param.name] = param.value;
      continue;
    }
    if (param && current && /^[^\s=]+=/.test(item)) {
      current.params[param.name] = param.value;
      continue;
    }
    const space = item.search(/\s/);
    const scheme = space === -1 ? item : item.slice(0, space);
    if (!TOKEN.test(scheme)) {
      // Not a scheme token; if we have a challenge, treat it as a stray param, else drop it.
      if (param && current) current.params[param.name] = param.value;
      continue;
    }
    current = { scheme: scheme.toLowerCase(), params: {} };
    challenges.push(current);
    const rest = space === -1 ? "" : item.slice(space + 1).trim();
    if (rest) {
      const first = readParam(rest);
      if (first) current.params[first.name] = first.value;
      else current.token68 = rest;
    }
  }
  return challenges;
}

function readParam(text: string): { name: string; value: string } | null {
  const eq = text.indexOf("=");
  if (eq <= 0) return null;
  const name = text.slice(0, eq).trim();
  if (!TOKEN.test(name)) return null;
  let raw = text.slice(eq + 1).trim();
  if (raw.startsWith('"')) {
    if (!raw.endsWith('"') || raw.length < 2) return null;
    raw = raw.slice(1, -1).replace(/\\(.)/g, "$1");
    return { name: name.toLowerCase(), value: raw };
  }
  if (!TOKEN.test(raw)) return null;
  return { name: name.toLowerCase(), value: raw };
}

function splitOutsideQuotes(text: string, separator: string): string[] {
  const out: string[] = [];
  let buf = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quoted) {
      buf += ch;
      if (ch === "\\" && i + 1 < text.length) {
        buf += text[i + 1];
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
      buf += ch;
      continue;
    }
    if (ch === separator) {
      out.push(buf);
      buf = "";
      continue;
    }
    buf += ch;
  }
  out.push(buf);
  return out;
}

export interface PaymentChallenge {
  index: number;
  id: string | null;
  realm: string | null;
  method: string | null;
  intent: string | null;
  expires: string | null;
  description: string | null;
  /** The base64url text of the request, as served. */
  request_raw: string | null;
  /** The decoded request bytes as text, when the base64url decoded at all. */
  request_text: string | null;
  /** The decoded request object, when it was a JSON object. */
  request: Record<string, unknown> | null;
  request_error: string | null;
}

function base64UrlDecode(text: string): string | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const text = new TextDecoder("utf-8").decode(bytes);
    // Invalid UTF-8 decodes to U+FFFD; the spec's request is JSON text, so a replacement character is a decode failure.
    return text.includes("\uFFFD") ? null : text;
  } catch {
    return null;
  }
}

/** Every `Payment` challenge in the header, decoded as far as it decodes. Other schemes are ignored by design. */
export function paymentChallenges(wwwAuthenticate: string | null | undefined): PaymentChallenge[] {
  return parseWwwAuthenticate(wwwAuthenticate)
    .filter((challenge) => challenge.scheme === "payment")
    .map((challenge, index) => {
      const p = challenge.params;
      const raw = p["request"] ?? null;
      let text: string | null = null;
      let request: Record<string, unknown> | null = null;
      let error: string | null = null;
      if (raw === null) error = "no request parameter";
      else {
        text = base64UrlDecode(raw);
        if (text === null) error = "request is not base64url of UTF-8 text";
        else {
          try {
            const parsed: unknown = JSON.parse(text);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) request = parsed as Record<string, unknown>;
            else error = "request decodes to JSON that is not an object";
          } catch {
            error = "request decodes to text that is not JSON";
          }
        }
      }
      return {
        index,
        id: p["id"] ?? null,
        realm: p["realm"] ?? null,
        method: p["method"] ?? null,
        intent: p["intent"] ?? null,
        expires: p["expires"] ?? null,
        description: p["description"] ?? null,
        request_raw: raw,
        request_text: text,
        request,
        request_error: error,
      };
    });
}

/** Whether the decoded request's bytes are exactly its RFC 8785 canonical form. */
export function requestIsCanonical(challenge: PaymentChallenge): boolean | null {
  if (!challenge.request || challenge.request_text === null) return null;
  try {
    return jcsCanonicalize(challenge.request) === challenge.request_text;
  } catch {
    return false;
  }
}

/**
 * Which protocols one 402 speaks, derived from its headers and never
 * typed: x402 when PAYMENT-REQUIRED is present, mpp when at least one
 * `Payment` challenge parses. Both, either, or neither.
 */
export function protocolsSpoken(headers: { get(name: string): string | null }): ("x402" | "mpp")[] {
  const spoken: ("x402" | "mpp")[] = [];
  if (headers.get("payment-required")) spoken.push("x402");
  if (paymentChallenges(headers.get("www-authenticate")).length > 0) spoken.push("mpp");
  return spoken;
}
