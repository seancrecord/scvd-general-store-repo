import type { DeclineReason } from "@/lib/payments";
import {
  blockingProblems,
  describeExactEvmPayload,
  describeHeaderEncoding,
  describeMismatch,
  describePayloadShape,
  looksLikeAnException,
  mismatchReasonCode,
  sdkRefusal,
} from "@/lib/requirement-match";
import type {
  MismatchReport,
  PayloadFieldProblem,
} from "@/lib/requirement-match";
import { isRecord } from "@/types";

/**
 * READING A DECLINE, FOR EVERY DOOR.
 *
 * Extracted from the HTTP gate on 2026-07-29 because CV asked the
 * question that should have been asked first: does the MCP door
 * inherit any of this? It did not. It ran its own copy of the payment
 * pipeline, which meant it had none of the diagnosis, no decline slot,
 * and — worse — recorded no declines AT ALL, so an agent bouncing off
 * the MCP door was invisible in the books that exist to catch exactly
 * that.
 *
 * One door getting the good instrument and the other getting silence
 * is the same failure as a rule that lives in a file instead of a
 * test. So the reading lives here now and both doors call it.
 */

/** The whole decoded payload, for shape and mismatch diagnosis. */
export function decodePaymentHeader(header: string | undefined): unknown {
  if (!header) {
    return undefined;
  }
  try {
    return JSON.parse(atob(header));
  } catch {
    return undefined;
  }
}

/** The 402 challenge the SDK just built, out of its own response header. */
export function decodeChallengeHeader(headers: Record<string, string>): unknown {
  const entry = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === "payment-required",
  );
  if (!entry) {
    return undefined;
  }
  try {
    return JSON.parse(atob(entry[1]));
  } catch {
    return undefined;
  }
}

/**
 * The reason the SDK refused BEFORE the facilitator was ever called.
 * Its two pre-verify exits (no matching requirement, extension refusal)
 * run no hooks, so the slot stays empty and the reason lives only in
 * the body it built. Read it there, and when it's a requirement
 * mismatch, say WHICH FIELD — we hold both objects, so "declined" is a
 * worse answer than we can give.
 */
export function refusalBeforeVerify(
  headers: Record<string, string>,
  paymentHeader: string | undefined,
): { decline: DeclineReason; mismatch?: MismatchReport } | undefined {
  // The challenge rides the header, not the body — the JSON body on
  // this path is ours alone. Cost an hour to find; hence the note.
  const challenge = decodeChallengeHeader(headers);
  const stated = sdkRefusal(challenge);
  if (!stated) {
    return undefined;
  }
  // The header before the envelope. A header that never decoded used
  // to book as `payload_not_an_object` whatever the cause — raw JSON,
  // the wrong alphabet, or the first line of a wrapped base64 — and
  // the books carry only the code, so the keeper learned nothing from
  // three of them. The cause goes in the code now; there are no
  // top-level fields to list because there was never an object.
  const encoding = paymentHeader
    ? describeHeaderEncoding(paymentHeader)
    : undefined;
  if (encoding) {
    return {
      decline: {
        reason: encoding.code,
        message: encoding.says,
        matched_by: "body",
      },
    };
  }
  const payload = decodePaymentHeader(paymentHeader);

  // The envelope first. A payload missing `accepted` makes the SDK's
  // matcher throw on undefined, and the TypeError it catches then
  // arrives here looking exactly like a crash of ours. Answer it in
  // words before that can happen.
  const shape = describePayloadShape(payload);
  if (shape) {
    return {
      decline: {
        reason: shape.code,
        message: `${shape.says} We saw these top-level fields: ${shape.keys_seen.join(", ") || "(none)"}.`,
        matched_by: "body",
      },
    };
  }

  const accepted = isRecord(payload) ? payload.accepted : undefined;
  const accepts = isRecord(challenge) ? challenge.accepts : undefined;
  const mismatch = describeMismatch(accepts, accepted);
  if (mismatch) {
    return {
      decline: {
        reason: mismatchReasonCode(mismatch),
        message: stated,
        matched_by: "body",
      },
      mismatch,
    };
  }
  // Never slug an exception into a reason code: it reads as our crash
  // and it puts an unbounded string family into the books.
  if (looksLikeAnException(stated)) {
    return {
      decline: {
        reason: "local:sdk_threw",
        message: `${stated} (That is the x402 library's own exception text, raised while reading the payment payload — not an error from the store's code. It nearly always means a field it expected was absent.)`,
        matched_by: "body",
      },
    };
  }
  return {
    decline: {
      reason: `local:${slugRefusal(stated)}`,
      message: stated,
      matched_by: "body",
    },
  };
}

/** The account that signed the authorization, straight off the header. */
export function payerFromPaymentHeader(header: string | undefined): string | undefined {
  const payload = decodePaymentHeader(header);
  if (!isRecord(payload) || !isRecord(payload.payload)) {
    return undefined;
  }
  const auth = payload.payload.authorization;
  if (!isRecord(auth) || typeof auth.from !== "string") {
    return undefined;
  }
  return /^0x[0-9a-fA-F]{40}$/.test(auth.from) ? auth.from : undefined;
}

/** Our reading of the inner payload, for a header we were handed. */
export function payloadProblemsFor(paymentHeader: string): PayloadFieldProblem[] {
  const payload = decodePaymentHeader(paymentHeader);
  if (!isRecord(payload)) {
    return [];
  }
  return describeExactEvmPayload(payload.accepted, payload.payload);
}

/**
 * The books take one string. When the facilitator's verdict is opaque
 * (`verify_error` tells us nothing) and we found a concrete field
 * problem, the row carries both: the verdict, then ours, split by a +.
 * The verdict is never replaced — it is the fact, ours is the reading.
 */
export function bookedReason(
  reason: string,
  problems: PayloadFieldProblem[],
): string {
  const first = problems[0];
  if (!first) {
    return reason;
  }
  const opaque =
    // `verify_error` and its classes alike: knowing the CALL timed out
    // still says nothing about the payload, so our reading of the
    // payload is still worth appending.
    reason === "verify_error" ||
    reason.startsWith("verify_error:") ||
    reason === "verification_declined" ||
    reason.startsWith("unspecified");
  return opaque ? `${reason}+payload:${first.field}` : reason;
}

/** Bounded, lowercase, book-safe. The verbatim string rides alongside. */
export function slugRefusal(stated: string): string {
  return stated
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

/** The refusals we will make on our own authority, for any door. */
export function preflightBlockers(
  paymentHeader: string | undefined,
): PayloadFieldProblem[] {
  return paymentHeader ? blockingProblems(payloadProblemsFor(paymentHeader)) : [];
}

/** The body a door returns when the pre-flight refuses. Same words either way. */
export function preflightRefusalBody(
  problems: PayloadFieldProblem[],
): { reason: string; message: string; note: string; payload_problems: PayloadFieldProblem[] } | undefined {
  const first = problems[0];
  if (!first) {
    return undefined;
  }
  return {
    reason: `local:preflight:${first.field}`,
    message: `${first.field}: ${first.says}`,
    note: "Caught here on purpose. The facilitator's answer to this is a truncated union-type error that names no field, so we check what we can check before spending the round trip.",
    payload_problems: problems,
  };
}

/**
 * Everything a door can say about a 402 that carried a signature.
 * The slot and the nonce map are the HTTP gate's own sources; a door
 * without them passes undefined and still gets the rest.
 */
export interface DeclineDiagnosis {
  decline?: DeclineReason;
  mismatch?: MismatchReport;
  payloadProblems: PayloadFieldProblem[];
}

export function diagnoseDecline(
  headers: Record<string, string>,
  paymentHeader: string | undefined,
  known?: DeclineReason,
): DeclineDiagnosis {
  const refusal = paymentHeader
    ? refusalBeforeVerify(headers, paymentHeader)
    : undefined;
  const diagnosis: DeclineDiagnosis = {
    payloadProblems: paymentHeader ? payloadProblemsFor(paymentHeader) : [],
  };
  const decline = known ?? refusal?.decline;
  if (decline) {
    diagnosis.decline = decline;
  }
  if (refusal?.mismatch) {
    diagnosis.mismatch = refusal.mismatch;
  }
  return diagnosis;
}

/**
 * A REFUSAL THAT WAS NEVER A JUDGEMENT (2026-09-04).
 *
 * `verify_error` means the verify CALL failed — our pipe to the
 * facilitator, its latency, or its own error — so the payload was
 * never examined. The buyer did nothing wrong, their signature is
 * still good, their nonce is unspent, and no money moved.
 *
 * What we sent them said the opposite. The 402 carried "The signed
 * payment was not accepted", the whole hand-rolling signing guide,
 * and a machine code that looks exactly like the ones that ARE their
 * fault. An agent reading that concludes its payment was rejected and
 * does one of two wrong things: re-signs a fresh authorization
 * (burning a nonce and a round trip on a payload that was already
 * fine), or marks the door broken and leaves. The correct move —
 * resend the byte-identical header in a moment — is the one thing the
 * response never said.
 *
 * The `+payload:` suffix is the exception: bookedReason appends it
 * when our own pre-flight DID find something wrong with what they
 * sent, and then the payload really is worth another look.
 */
export function isNeverJudged(decline: DeclineReason | undefined): boolean {
  const reason = decline?.reason;
  if (reason === undefined) {
    return false;
  }
  return (
    (reason === "verify_error" || reason.startsWith("verify_error:")) &&
    !reason.includes("+payload:")
  );
}

/** How long the authorization they already signed stays good. */
export function signedValidBefore(header: string | undefined): number | undefined {
  if (!header) {
    return undefined;
  }
  try {
    const payload = JSON.parse(atob(header)) as unknown;
    const auth = isRecord(payload) && isRecord(payload["payload"])
      ? payload["payload"]["authorization"]
      : undefined;
    const value = isRecord(auth) ? auth["validBefore"] : undefined;
    const seconds = typeof value === "string" ? Number(value) : NaN;
    return Number.isFinite(seconds) ? seconds : undefined;
  } catch {
    return undefined;
  }
}

/** The seconds we ask an agent to wait before resending the same payload. */
export const RESEND_AFTER_SECONDS = 2;

/**
 * The words BOTH doors say when the payload was never judged. Shared
 * for the same reason the reading itself is: on 2026-07-29 the HTTP
 * door had the whole decline instrument and the MCP door had none of
 * it, and one door getting the good answer is the bug, not the fix.
 * The MCP door is the one an agent reads as JSON with no human in the
 * loop, so it is the last place that should get the vaguer wording.
 */
export function neverJudgedBlock(
  signedUntil?: number,
): Record<string, unknown> {
  return {
    fault: "upstream",
    note: "Your payment was NEVER JUDGED. The call from this store to the payment facilitator failed, so nothing looked at your signature, your authorization or your wallet. No money moved, your nonce is unspent, and nothing is wrong with what you sent.",
    retry: {
      resend_identical_payload: true,
      after_seconds: RESEND_AFTER_SECONDS,
      ...(signedUntil ? { payload_valid_until: signedUntil } : {}),
      how: `Wait ${RESEND_AFTER_SECONDS} seconds and send the SAME payment payload again, byte for byte, to this same resource. Do not re-sign and do not generate a new nonce${signedUntil ? ` — the authorization you already hold is good until unix ${signedUntil}` : ""}. Re-signing is not unsafe, it is just wasted work on a payload that was never the problem.`,
      if_it_repeats:
        "Two or three of these in a row is an outage on the payment rail rather than anything you can fix. Back off and come back later; the price and the goods will be here.",
    },
  };
}

/** The note for a refusal that WAS a judgement. */
export const JUDGED_NOTE =
  "The signed payment was not accepted; no money moved and nothing left the shelf.";

