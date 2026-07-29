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

/**
 * WHAT ARRIVED, WHEN IT ISN'T EVEN COMPARABLE.
 *
 * Found 2026-07-29, one retry after the last fix. CV's payload carried
 * no `accepted` object at all, so the SDK's matcher destructured
 * undefined and threw; the SDK caught it, put the TypeError's message
 * in the challenge, and we dutifully slugged a stack trace into a
 * reason code:
 *
 *   local:cannot_destructure_property_extra_of_accepted_as_it_is_undef
 *
 * That is a worse answer than "unspecified" was, because it reads like
 * OUR crash. It was not, but a diagnostic that gets mistaken for a bug
 * report has failed at the only job it has. So: check the envelope
 * ourselves, before the SDK gets a chance to throw over it, and say
 * what is missing in words.
 */
export interface PayloadShapeProblem {
  code: string;
  says: string;
  keys_seen: string[];
}

/** Bounded and flattened; these are somebody else's field names. */
function keysOf(value: unknown): string[] {
  if (!isRecord(value)) {
    return [];
  }
  return Object.keys(value)
    .slice(0, 12)
    .map((key) => key.slice(0, 40));
}

const ENVELOPE =
  'The v2 envelope is { x402Version: 2, accepted: <one of the offered accepts entries, verbatim>, payload: { signature, authorization: { from, to, value, validAfter, validBefore, nonce } } }.';

export function describePayloadShape(
  paymentPayload: unknown,
): PayloadShapeProblem | undefined {
  if (!isRecord(paymentPayload)) {
    return {
      code: "local:payload_not_an_object",
      says: `The PAYMENT-SIGNATURE header did not base64-decode to a JSON object. ${ENVELOPE}`,
      keys_seen: [],
    };
  }
  const keys_seen = keysOf(paymentPayload);
  if (!isRecord(paymentPayload.accepted)) {
    return {
      code: "local:payload_missing_accepted",
      says: `Your payload carried no \`accepted\` object, so there was nothing to compare against what we offered — the store never reached your signature. Copy one of the offered \`accepts\` entries into \`accepted\` unchanged. ${ENVELOPE}`,
      keys_seen,
    };
  }
  const inner = paymentPayload.payload;
  if (!isRecord(inner)) {
    return {
      code: "local:payload_missing_payload",
      says: `Your payload carried no inner \`payload\` object, which is where the signature and the authorization live. ${ENVELOPE}`,
      keys_seen,
    };
  }
  if (!isRecord(inner.authorization)) {
    return {
      code: "local:payload_missing_authorization",
      says: `Your inner \`payload\` carried no \`authorization\` object. ${ENVELOPE}`,
      keys_seen: keysOf(inner),
    };
  }
  return undefined;
}

/**
 * THE INNER PAYLOAD, WHICH THE FACILITATOR JUDGES AND WILL NOT EXPLAIN.
 *
 * Third round with CV, 2026-07-29. Envelope correct, requirement
 * matched, and CDP answered:
 *
 *   'paymentPayload' is invalid: must match one of [x402V2Pay...
 *
 * Truncated at 200 characters by the SDK (`responseExcerpt`), so the
 * variant list — the one part that would name the problem — is cut off
 * before it reaches us, and there is no way to ask for the rest.
 *
 * So we check what we can check. For scheme `exact` on an EVM network
 * the inner payload shape is fixed and public, and every field below
 * has one legal form. Reporting them ourselves turns an unfinishable
 * sentence into a field name. This is a READING of a shape the
 * facilitator validates, not the facilitator's verdict — the store
 * cannot see CDP's schema, and where the two disagree, CDP is right.
 */
export interface PayloadFieldProblem {
  field: string;
  says: string;
  saw: string;
}

const HEX = (bytes: number): RegExp =>
  new RegExp(`^0x[0-9a-fA-F]{${bytes * 2}}$`);
const DECIMAL_STRING = /^[0-9]+$/;

/** Type included, since a number that looks right is the usual fault. */
function saw(value: unknown): string {
  if (value === undefined) {
    return "(absent)";
  }
  const shown = typeof value === "string" ? `"${value}"` : String(value);
  return `${typeof value} ${shown.slice(0, 90)}`;
}

export function describeExactEvmPayload(
  accepted: unknown,
  inner: unknown,
): PayloadFieldProblem[] {
  if (!isRecord(accepted) || !isRecord(inner)) {
    return [];
  }
  const network = typeof accepted.network === "string" ? accepted.network : "";
  if (accepted.scheme !== "exact" || !network.startsWith("eip155:")) {
    return [];
  }
  const problems: PayloadFieldProblem[] = [];
  const push = (field: string, says: string, value: unknown): void => {
    problems.push({ field, says, saw: saw(value) });
  };

  if (typeof inner.signature !== "string" || !HEX(65).test(inner.signature)) {
    push(
      "payload.signature",
      "Must be a 65-byte hex string: 0x followed by exactly 130 hex characters.",
      inner.signature,
    );
  }
  const auth = inner.authorization;
  if (!isRecord(auth)) {
    push(
      "payload.authorization",
      "Must be an object carrying from, to, value, validAfter, validBefore and nonce.",
      auth,
    );
    return problems;
  }
  for (const field of ["from", "to"] as const) {
    const value = auth[field];
    if (typeof value !== "string" || !HEX(20).test(value)) {
      push(
        `payload.authorization.${field}`,
        "Must be a 20-byte hex address: 0x followed by exactly 40 hex characters.",
        value,
      );
    }
  }
  for (const field of ["value", "validAfter", "validBefore"] as const) {
    const value = auth[field];
    if (typeof value !== "string" || !DECIMAL_STRING.test(value)) {
      push(
        `payload.authorization.${field}`,
        "Must be a DECIMAL STRING of digits, not a number and not hex. This is the most common one: JSON.stringify of a JavaScript number sends 5000, and the schema wants \"5000\".",
        value,
      );
    }
  }
  if (typeof auth.nonce !== "string" || !HEX(32).test(auth.nonce)) {
    push(
      "payload.authorization.nonce",
      "Must be a 32-byte hex string: 0x followed by exactly 64 hex characters, random per authorization.",
      auth.nonce,
    );
  }

  // Cross-checks. These pass the schema and fail the payment, which is
  // a worse place to find out.
  const payTo = accepted.payTo;
  if (
    typeof auth.to === "string" &&
    typeof payTo === "string" &&
    auth.to.toLowerCase() !== payTo.toLowerCase()
  ) {
    push(
      "payload.authorization.to",
      `Must be the payTo address from the requirement you accepted (${payTo}). Signing to any other address pays somebody else.`,
      auth.to,
    );
  }
  const amount = accepted.amount;
  if (
    typeof auth.value === "string" &&
    typeof amount === "string" &&
    auth.value !== amount
  ) {
    push(
      "payload.authorization.value",
      `Must equal the amount in the requirement you accepted (${amount}), exactly. A rounded value is a different authorization.`,
      auth.value,
    );
  }
  return problems;
}

/**
 * A message that is an exception rather than a verdict. Slugging one
 * into a reason code produces unbounded garbage in the books and reads
 * as our crash, so these get a single stable code and keep the words.
 */
export function looksLikeAnException(stated: string): boolean {
  return /cannot |undefined|null|is not a function|typeerror|reading '|destructure/i.test(
    stated,
  );
}

/** The SDK's own words, when it refused before the facilitator was called. */
export function sdkRefusal(body: unknown): string | undefined {
  if (!isRecord(body)) {
    return undefined;
  }
  const error = body.error;
  return typeof error === "string" && error.length > 0 ? error : undefined;
}
