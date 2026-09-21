import { decodeBase64Json, encodeBase64Json } from "@/lib/base64-json";
import { isRecord } from "@/types";

/**
 * THE QUOTE STAMP (2026-09-21, the keeper's ruling on the question
 * services/buyer-signals.ts had parked since 09-18).
 *
 * The store measured the two ends of a purchase and nothing between
 * them: a 402 went out, a payment came back, and no row could say
 * which 402 a given payment answered or how long the agent took to
 * decide. The August papers named it (quote-to-pay latency) and the
 * signals file said why it waited: the only link is something echoed
 * inside the accepted terms, and the accepted terms are money-adjacent
 * bytes.
 *
 * WHAT IT IS. One field, `extra.quotedAt`, the ISO instant the 402
 * was minted, on every accepts entry the challenge offers. x402 v2
 * clients echo the accepted entry back whole on the paid retry, so
 * the instant comes back with the payment. The till reads it, books
 * `quoted_at` on the challenge, settle and decline rows, and books
 * `quote_to_pay_ms` on the two that answer a quote.
 *
 * WHAT IT IS NOT. Not an identity. It names no wallet, no session and
 * no visitor; two knocks in the same millisecond carry the same
 * stamp; a buyer who edits it corrupts nothing but their own latency
 * row. The trust page's data stance (store/trust-signals.ts,
 * DATA_HANDLING.join_keys) says the same in public.
 *
 * WHY A TIME AND NOT A RANDOM ID. The challenge row's `at` already IS
 * the issue instant, so a settle carrying the instant joins to its
 * challenge without a new key, and the 402 stays deterministic under
 * one clock — test/doors-parity.spec.ts freezes the clock and asserts
 * the two Workers answer byte for byte, which a random id would have
 * broken for no gain.
 *
 * WHY THE FACILITATOR NEVER SEES IT. The SDK's own matcher
 * (paymentRequirementsMatchAccepted) asks that the server's `extra`
 * be a SUBSET of the echoed one, so the freshly built requirements on
 * the retry — which carry no stamp, the route config is static —
 * still match an echo that does. CDP's facilitator runs code we
 * cannot read, so the payload it receives is stripped of the stamp
 * (withoutQuoteStamp, applied in KvWarmFacilitatorClient) and is byte
 * for byte what it received before this shipped. The signature does
 * not cover `accepted`, so nothing about verification changes.
 */

export const QUOTE_STAMP_FIELD = "quotedAt";

/** A decision older than this is not a decision the stamp can describe: the stamp was reused, or the clock lied. */
export const QUOTE_TO_PAY_CEILING_MS = 24 * 60 * 60 * 1000;

export type QuoteToPayBucket =
  | "under_5s"
  | "under_30s"
  | "under_2m"
  | "under_10m"
  | "over_10m"
  | "unstamped";

function stampAccepts(accepts: unknown, quotedAt: string): unknown {
  if (!Array.isArray(accepts)) return accepts;
  return accepts.map((entry) => {
    if (!isRecord(entry)) return entry;
    const extra = isRecord(entry["extra"]) ? entry["extra"] : {};
    return { ...entry, extra: { ...extra, [QUOTE_STAMP_FIELD]: quotedAt } };
  });
}

/**
 * The 402 as the SDK built it, with the instant on every offer. The
 * PAYMENT-REQUIRED header is where a compliant client reads terms; the
 * body carries `accepts` only when the SDK wrote its own (a decline
 * re-quote), and is stamped when it does so the two never disagree.
 * Any failure returns the response untouched: a stamp is bookkeeping
 * and no bookkeeping is worth blocking a quote.
 */
export function stampQuotedAt(
  headers: Record<string, string>,
  body: unknown,
  quotedAt: string,
): { headers: Record<string, string>; body: unknown } {
  let stampedHeaders = headers;
  try {
    const headerName = Object.keys(headers).find((name) => name.toLowerCase() === "payment-required");
    if (headerName) {
      const decoded = decodeBase64Json(headers[headerName] as string);
      if (isRecord(decoded) && Array.isArray(decoded["accepts"])) {
        stampedHeaders = {
          ...headers,
          [headerName]: encodeBase64Json({ ...decoded, accepts: stampAccepts(decoded["accepts"], quotedAt) }),
        };
      }
    }
  } catch {
    stampedHeaders = headers;
  }
  const stampedBody =
    isRecord(body) && Array.isArray(body["accepts"])
      ? { ...body, accepts: stampAccepts(body["accepts"], quotedAt) }
      : body;
  return { headers: stampedHeaders, body: stampedBody };
}

/** The instant the buyer's echoed terms carry, or null when they carry none the store can read. */
export function quotedAtOf(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  const accepted = payload["accepted"];
  if (!isRecord(accepted)) return null;
  const extra = accepted["extra"];
  if (!isRecord(extra)) return null;
  const value = extra[QUOTE_STAMP_FIELD];
  if (typeof value !== "string" || value.length > 40) return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

/** Same, straight off the base64 payment header either door receives. */
export function quotedAtFromPaymentHeader(header: string | undefined): string | null {
  if (!header) return null;
  try {
    return quotedAtOf(decodeBase64Json(header));
  } catch {
    return null;
  }
}

/**
 * How long the decision took, or null: no stamp, a stamp from the
 * future, or one older than the ceiling. Null is booked as unstamped
 * rather than as a number, because a number that means "unknown" is
 * the failure this store sells the argument against.
 */
export function quoteToPayMs(quotedAt: string | null, now: number): number | null {
  if (!quotedAt) return null;
  const issued = Date.parse(quotedAt);
  if (!Number.isFinite(issued)) return null;
  const elapsed = now - issued;
  if (elapsed < 0 || elapsed > QUOTE_TO_PAY_CEILING_MS) return null;
  return elapsed;
}

export function quoteToPayBucket(ms: number | null | undefined): QuoteToPayBucket {
  if (ms === null || ms === undefined) return "unstamped";
  if (ms < 5_000) return "under_5s";
  if (ms < 30_000) return "under_30s";
  if (ms < 120_000) return "under_2m";
  if (ms < 600_000) return "under_10m";
  return "over_10m";
}

/**
 * The payload with the stamp taken back out of `accepted.extra`, for
 * the facilitator. A copy, never a mutation: the store's own readers
 * take the stamp off the header they parsed themselves, and the
 * retained purchase record keeps the payload as the buyer sent it.
 */
export function withoutQuoteStamp<T>(payload: T): T {
  if (!isRecord(payload)) return payload;
  const accepted = payload["accepted"];
  if (!isRecord(accepted) || !isRecord(accepted["extra"])) return payload;
  if (!(QUOTE_STAMP_FIELD in accepted["extra"])) return payload;
  const { [QUOTE_STAMP_FIELD]: _stamp, ...extra } = accepted["extra"];
  const stripped: Record<string, unknown> = { ...accepted };
  if (Object.keys(extra).length > 0) stripped["extra"] = extra;
  else delete stripped["extra"];
  return { ...payload, accepted: stripped } as T;
}
