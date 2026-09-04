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

const SVM_ENVELOPE =
  'For a solana:* network the v2 envelope is { x402Version: 2, accepted: <one of the offered accepts entries, verbatim>, payload: { transaction: <base64-encoded signed Solana transaction> } } — there is no EIP-3009 authorization on Solana.';

/** Which rail the payload claims, read from its own accepted echo. */
function acceptedNetworkOf(paymentPayload: Record<string, unknown>): string {
  const accepted = paymentPayload.accepted;
  return isRecord(accepted) && typeof accepted.network === "string"
    ? accepted.network
    : "";
}

/**
 * THE HEADER THAT NEVER BECAME AN ENVELOPE (2026-09-04, three emails
 * about small_blessing from client curl/8.5.0, all
 * `local:payload_not_an_object`).
 *
 * That code was one bucket for every way a header can fail to decode,
 * and the desk's reading for the whole `local:payload_` family said
 * "the message beside this names the field and lists what arrived" —
 * which for this bucket was false twice over: no field was absent,
 * because there was no object to be missing one, and the books keep
 * the CODE, not the message, so nothing beside it said anything. The
 * keeper got the same non-answer three times.
 *
 * We hold the raw header, so we can say HOW it failed, in the code
 * itself, where the books and the email carry it. The SDK's own gate
 * is reproduced here (its Base64EncodedRegex, then atob, then
 * JSON.parse) so that what we call broken is exactly what it refused
 * — a header this passes is one the SDK parsed.
 *
 * The one that turned out to be common enough to earn its own code:
 * GNU `base64` wraps its output at 76 columns unless told `-w0`, and
 * curl sends only a header value's FIRST LINE. 76 is divisible by 4,
 * so what arrives is clean base64 of the first 57 bytes of the
 * envelope — `{"x402Version":2,"accepted":{"scheme":"exact","network":"`
 * and then nothing. A curl client at this store hits that exact wall.
 */
const SDK_BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const URL_SAFE_BASE64 = /^[A-Za-z0-9\-_]*={0,2}$/;
/** GNU coreutils' default wrap width; curl keeps only the first line. */
const GNU_BASE64_WRAP_COLUMNS = 76;

const ONE_LINE =
  "The header must be the envelope base64-encoded with the STANDARD alphabet (A-Z a-z 0-9 + / and = padding) as ONE unbroken line: base64(JSON.stringify(envelope)) in JavaScript, or `base64 -w0` from a shell.";

/** Somebody else's bytes, bounded and printable, for the 402 only. */
function excerpt(text: string): string {
  return text
    .slice(0, 40)
    .replace(/[^\x20-\x7e]/g, "·");
}

/**
 * Why the raw PAYMENT-SIGNATURE header did not decode. Undefined when
 * it decodes to JSON of any type — the shape check below takes over.
 */
export function describeHeaderEncoding(
  header: string,
): PayloadShapeProblem | undefined {
  const trimmed = header.trim();
  if (trimmed.startsWith("{")) {
    return {
      code: "local:payload_not_base64:raw_json",
      says: `The PAYMENT-SIGNATURE header carried the JSON envelope itself, not its base64 encoding, so the x402 library read it as no payment at all. ${ONE_LINE} (Over MCP, _meta['x402/payment'] accepts the raw object; the HTTP header does not.) ${ENVELOPE}`,
      keys_seen: [],
    };
  }
  if (/\s/.test(trimmed)) {
    return {
      code: "local:payload_not_base64:whitespace",
      says: `The PAYMENT-SIGNATURE header contained whitespace, which the x402 library's base64 check refuses before decoding. ${ONE_LINE} ${ENVELOPE}`,
      keys_seen: [],
    };
  }
  if (!SDK_BASE64.test(trimmed)) {
    if (/[-_]/.test(trimmed) && URL_SAFE_BASE64.test(trimmed)) {
      return {
        code: "local:payload_not_base64:url_safe",
        says: `The PAYMENT-SIGNATURE header used the URL-safe base64 alphabet (- and _), which the x402 library refuses. ${ONE_LINE} ${ENVELOPE}`,
        keys_seen: [],
      };
    }
    return {
      code: "local:payload_not_base64",
      says: `The PAYMENT-SIGNATURE header is not base64: it carries characters outside A-Z a-z 0-9 + / =. ${ONE_LINE} ${ENVELOPE}`,
      keys_seen: [],
    };
  }
  let text: string;
  try {
    text = atob(trimmed);
  } catch {
    return {
      code: "local:payload_not_base64",
      says: `The PAYMENT-SIGNATURE header looks like base64 but does not decode (its length is wrong for base64). ${ONE_LINE} ${ENVELOPE}`,
      keys_seen: [],
    };
  }
  try {
    JSON.parse(text);
    return undefined;
  } catch {
    // Fall through: base64 was fine, the bytes inside were not JSON.
  }
  if (text.trimStart().startsWith("{")) {
    const wrapped =
      trimmed.length === GNU_BASE64_WRAP_COLUMNS
        ? ` This header is exactly ${GNU_BASE64_WRAP_COLUMNS} characters, which is that wrap width.`
        : "";
    return {
      code: "local:payload_truncated_envelope",
      says: `The PAYMENT-SIGNATURE header was valid base64 of the FIRST ${text.length} bytes of a JSON object and then stopped: the envelope arrived cut off. The usual cause is a base64 tool that wraps its output into lines (GNU \`base64\` does, at ${GNU_BASE64_WRAP_COLUMNS} columns, unless you pass -w0) and an HTTP client that sends only a header's first line (curl does).${wrapped} Nothing is wrong with your signature or your wallet; the store never saw them. ${ONE_LINE} ${ENVELOPE}`,
      keys_seen: [],
    };
  }
  return {
    code: "local:payload_not_json",
    says: `The PAYMENT-SIGNATURE header was base64, but what it decoded to is not JSON. It begins: "${excerpt(text)}". Base64-encode the JSON envelope, not a signature or a transaction on its own. ${ONE_LINE} ${ENVELOPE}`,
    keys_seen: [],
  };
}

export function describePayloadShape(
  paymentPayload: unknown,
): PayloadShapeProblem | undefined {
  if (!isRecord(paymentPayload)) {
    // A header that failed to decode at all is described by
    // describeHeaderEncoding, which runs first. What reaches this
    // branch is JSON of the wrong type: a string (an envelope
    // encoded twice), an array, a number, or null.
    const type =
      paymentPayload === null
        ? "null"
        : Array.isArray(paymentPayload)
          ? "an array"
          : `a ${typeof paymentPayload}`;
    return {
      code: "local:payload_not_an_object",
      says: `The PAYMENT-SIGNATURE header decoded to JSON, but to ${type} rather than an object${typeof paymentPayload === "string" ? " — usually an envelope that was base64-encoded twice, or JSON.stringify applied to an already-serialized string" : ""}. Base64-encode the envelope object itself, once. ${ENVELOPE}`,
      keys_seen: [],
    };
  }
  const keys_seen = keysOf(paymentPayload);
  if (!isRecord(paymentPayload.accepted)) {
    /**
     * THE v1 STRAGGLER, recognized rather than lumped in (2026-08-11,
     * after a live outside decline read only "missing accepted"). The
     * x402 v1 envelope carried scheme and network at the TOP level
     * and no accepted echo, so every v1 client fails this exact
     * check — and "your payload is missing a field" tells a client
     * that faithfully implements the old protocol nothing. Naming the
     * actual disagreement — protocol version, not a dropped field —
     * is the difference between an upgrade and a debugging session.
     */
    if (
      paymentPayload.x402Version === 1 ||
      (typeof paymentPayload.scheme === "string" &&
        typeof paymentPayload.network === "string")
    ) {
      return {
        code: "local:payload_v1_envelope",
        says: `This is the x402 v1 envelope — scheme and network at the top level, no \`accepted\` echo. This store speaks x402 v2, where the payload echoes one of the offered \`accepts\` entries back verbatim as \`accepted\`. Nothing is wrong with your signature or your wallet; your client predates the current protocol. A current client (e.g. @x402/fetch) handles it, or hand-roll it: ${ENVELOPE}`,
        keys_seen,
      };
    }
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
    /**
     * THE SECOND RAIL'S SHAPE, learned the expensive way on
     * 2026-08-04: a Solana exact payload carries a signed TRANSACTION,
     * not an EIP-3009 authorization — that rail has no such object.
     * This branch used to demand `authorization` unconditionally, so
     * when the SDK refused eight Solana payments pre-verify for some
     * OTHER reason, the diagnosis relabeled every one of them
     * "payload_missing_authorization" — an instrument overwriting the
     * evidence it existed to surface. A correctly-shaped SVM payload
     * now passes through so the SDK's true refusal reaches the buyer.
     */
    if (acceptedNetworkOf(paymentPayload).startsWith("solana:")) {
      if (
        typeof inner.transaction !== "string" ||
        inner.transaction.length === 0
      ) {
        return {
          code: "local:payload_missing_transaction",
          says: `Your inner \`payload\` carried no \`transaction\` string. ${SVM_ENVELOPE}`,
          keys_seen: keysOf(inner),
        };
      }
      return undefined;
    }
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
  /**
   * BLOCKING problems are wrong against the published v2 schema, full
   * stop, so the store refuses locally and spends no facilitator call
   * on them. ADVISORY problems are ones where our reading could be the
   * narrow one — a smart-account signature under ERC-1271 is not 65
   * bytes, and refusing it because ours usually are would turn a
   * diagnostic into a wall. Advisory problems are reported and never
   * refused.
   */
  blocking: boolean;
}

/** The refusals we are willing to make on our own authority. */
export function blockingProblems(
  problems: PayloadFieldProblem[],
): PayloadFieldProblem[] {
  return problems.filter((problem) => problem.blocking);
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
  const push = (
    field: string,
    says: string,
    value: unknown,
    blocking = true,
  ): void => {
    problems.push({ field, says, saw: saw(value), blocking });
  };

  if (typeof inner.signature !== "string" || !inner.signature.startsWith("0x")) {
    push(
      "payload.signature",
      "Must be a hex string starting 0x. An EOA signature is 65 bytes (130 hex characters).",
      inner.signature,
    );
  } else if (!HEX(65).test(inner.signature)) {
    // ADVISORY, deliberately. A smart-account signature under ERC-1271
    // or ERC-6492 is not 65 bytes, and a store that refuses one because
    // most signatures are has turned its own diagnostic into a wall.
    push(
      "payload.signature",
      "Not the usual 65 bytes (130 hex characters). That is normal for a smart-account signature and wrong for an EOA — we do not refuse it, we just say so, because from here the two are indistinguishable.",
      inner.signature,
      false,
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
