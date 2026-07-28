import { isRecord } from "@/types";

/**
 * WHY A SIGNED PAYMENT NEVER REACHED THE FACILITATOR.
 *
 * Found 2026-07-28, from three declines CV logged with a correctly
 * signed authorization and a domain copied out of our own challenge.
 * All three booked `unspecified:reason_not_captured` — the label whose
 * own reading said "if it recurs, the hook is not firing." It wasn't
 * firing, and it could not have been.
 *
 * The SDK rejects a payment in THREE places, and only the last one has
 * a hook on it:
 *
 *   1. findMatchingRequirements() → "No matching payment requirements"
 *   2. validateExtensions()       → the extension's own reason
 *   3. verifyPayment()            → the facilitator's verdict  ← hooks
 *
 * Steps 1 and 2 never call the facilitator, so onAfterVerify and
 * onVerifyFailure cannot see them. The reason was never lost; it was
 * never offered. It sits in the SDK's own 402 body as `error`, which
 * we were discarding.
 *
 * THE MATCH IS STRICTER THAN IT LOOKS. The SDK deep-compares the
 * client's `accepted` object against each offered requirement with
 * everything except `extra` (which is subset-checked), and its
 * deepEqual sorts keys before comparing — so field ORDER is free, but
 * the KEY SET must be identical and the TYPES must match exactly.
 * "5000" is not 5000. A missing `description` fails. An extra field of
 * your own fails. This is why the right client behaviour is to echo
 * one of the offered `accepts` entries back VERBATIM rather than
 * rebuild it, and why a store that only says "declined" is useless
 * here: the mismatch is in a specific field and we can see which.
 */

/** One field where the client's echo and our offer disagree. */
export interface FieldMismatch {
  field: string;
  we_offered: unknown;
  you_sent: unknown;
}

export interface MismatchReport {
  /** The offered entry that came closest, by fewest disagreements. */
  closest_offer_index: number;
  mismatches: FieldMismatch[];
  note: string;
}

const ABSENT = "(field not present)";

/** The SDK's comparison, reproduced: key order free, key set and types exact. */
function normalize(value: unknown): string {
  if (value === null || value === undefined) {
    return JSON.stringify(value) ?? "undefined";
  }
  if (typeof value !== "object") {
    return JSON.stringify(value) ?? "";
  }
  if (Array.isArray(value)) {
    return JSON.stringify(value.map((item) => JSON.parse(normalize(item))));
  }
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const inner = (value as Record<string, unknown>)[key];
    sorted[key] =
      typeof inner === "object" && inner !== null
        ? JSON.parse(normalize(inner))
        : inner;
  }
  return JSON.stringify(sorted);
}

function same(a: unknown, b: unknown): boolean {
  return normalize(a) === normalize(b);
}

/** Reported so a type error reads as a type error, not a value that looks equal. */
function shown(holder: Record<string, unknown>, field: string): unknown {
  if (!Object.hasOwn(holder, field)) {
    return ABSENT;
  }
  const value = holder[field];
  return typeof value === "string" ? value : { [typeof value]: value };
}

function compareOne(
  offered: Record<string, unknown>,
  sent: Record<string, unknown>,
): FieldMismatch[] {
  const mismatches: FieldMismatch[] = [];
  const fields = new Set([...Object.keys(offered), ...Object.keys(sent)]);
  for (const field of [...fields].sort()) {
    if (field === "extra") {
      // Subset-checked by the SDK, not deep-equal: every key we
      // published must be present with the same value; yours may add.
      const offeredExtra = offered.extra;
      const sentExtra = sent.extra;
      if (!isRecord(offeredExtra)) {
        continue;
      }
      if (!isRecord(sentExtra)) {
        mismatches.push({
          field: "extra",
          we_offered: offeredExtra,
          you_sent: sentExtra ?? ABSENT,
        });
        continue;
      }
      for (const key of Object.keys(offeredExtra)) {
        if (!same(offeredExtra[key], sentExtra[key])) {
          mismatches.push({
            field: `extra.${key}`,
            we_offered: shown(offeredExtra, key),
            you_sent: shown(sentExtra, key),
          });
        }
      }
      continue;
    }
    if (!same(offered[field], sent[field])) {
      mismatches.push({
        field,
        we_offered: shown(offered, field),
        you_sent: shown(sent, field),
      });
    }
  }
  return mismatches;
}

/**
 * Which field turned the payment away. Returns undefined when the echo
 * matches an offer (i.e. the refusal came from somewhere else), so a
 * caller can never print a mismatch that isn't there.
 */
export function describeMismatch(
  accepts: unknown,
  accepted: unknown,
): MismatchReport | undefined {
  if (!Array.isArray(accepts) || accepts.length === 0 || !isRecord(accepted)) {
    return undefined;
  }
  let best: { index: number; mismatches: FieldMismatch[] } | undefined;
  for (const [index, offer] of accepts.entries()) {
    if (!isRecord(offer)) {
      continue;
    }
    const mismatches = compareOne(offer, accepted);
    if (mismatches.length === 0) {
      return undefined;
    }
    if (!best || mismatches.length < best.mismatches.length) {
      best = { index, mismatches };
    }
  }
  if (!best) {
    return undefined;
  }
  return {
    closest_offer_index: best.index,
    mismatches: best.mismatches,
    note: "Your `accepted` object must deep-equal one of the offered `accepts` entries — same key set, same types, `extra` a superset of ours. Field order does not matter; a string where we published a number does. The reliable move is to echo the offered entry back unchanged rather than rebuild it.",
  };
}

/**
 * The books want a short, bounded string. The field that disagreed is
 * the whole diagnosis, so it rides in the reason itself.
 */
export function mismatchReasonCode(report: MismatchReport): string {
  const first = report.mismatches[0];
  return first
    ? `local:requirement_mismatch:${first.field}`
    : "local:requirement_mismatch";
}

/** The SDK's own words, when it refused before the facilitator was called. */
export function sdkRefusal(body: unknown): string | undefined {
  if (!isRecord(body)) {
    return undefined;
  }
  const error = body.error;
  return typeof error === "string" && error.length > 0 ? error : undefined;
}
