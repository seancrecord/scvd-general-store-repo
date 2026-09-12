/**
 * THE SETTLEMENT-RESPONSE READER (2026-09-12).
 *
 * What a buyer holds after paying an x402 door is the facilitator's
 * SettleResponse: base64 JSON in the PAYMENT-RESPONSE header, or the
 * JSON body of a facilitator's /settle. Every field in it is somebody
 * else's word, and this reader never pretends otherwise. It answers
 * two narrower questions, offline, with no key and no network:
 *
 *   1. Is the response the shape the merged x402 v2 specification
 *      describes (§5.3.2 fields, §9 settlement_pending)?
 *   2. What may a reader CONCLUDE from it — settled, failed, or
 *      unresolved?
 *
 * The second question is the one that costs money. §9 makes
 * settlement_pending non-terminal: the transaction may still confirm.
 * A reader that maps success:false straight to "failed" re-challenges
 * a buyer whose money is on its way, and the payer signs a second
 * authorization for goods the first one is paying for. Seven of ten
 * money paths read on the spec thread in early September did exactly
 * that. So the fixtures beside this file carry, for each shape, both
 * the checks it fails and the outcome a reader must reach — and, for
 * the shapes that matter, the outcome it MUST NOT reach. A battery
 * that cannot fail cannot pass; the pending fixtures are the ones a
 * naive reader fails.
 *
 * WHAT THIS BATTERY DOES NOT READ. The settlement status vocabulary
 * proposed on x402-foundation/x402#3325 (status, statusAnchor,
 * statusDetail) is a draft on a branch. Unknown fields are ignored
 * here, as a v2 reader ignores them; when the vocabulary merges, a
 * later battery version reads it and says so in its name.
 *
 * Zero dependencies, MIT, and it runs on any issuer's bytes.
 */

export const SETTLEMENT_RESPONSE_BATTERY = "settlement-response-v1";

/** Every check, in the order it runs. A fixture's expect_failed names these and nothing else. */
export const SETTLEMENT_RESPONSE_CHECKS = Object.freeze([
  "json",
  "success-boolean",
  "transaction-string",
  "network-caip2",
  "error-reason-string",
  "error-reason-on-success",
  "pending-names-transaction",
  "payer-string",
  "amount-atomic",
]);

export const SETTLEMENT_OUTCOMES = Object.freeze(["settled", "failed", "unresolved"]);

/** CAIP-2: namespace ":" reference. */
const CAIP2 = /^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}$/;
const ATOMIC = /^[0-9]+$/;
const PENDING = "settlement_pending";

const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

function base64ToUtf8(text) {
  try {
    const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
    const binary = atob(padded);
    return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
  } catch {
    return null;
  }
}

/**
 * The bytes as the buyer holds them — the header value verbatim, or
 * the decoded JSON text — to an object, or null. Only an OBJECT ends
 * the search: a bare number that happens to parse must not stop the
 * base64 reading of the same bytes.
 */
export function decodeSettlementResponse(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  for (const attempt of [text, base64ToUtf8(text)]) {
    if (attempt === null) continue;
    try {
      const parsed = JSON.parse(attempt);
      if (isRecord(parsed)) return parsed;
    } catch {
      // try the other reading
    }
  }
  return null;
}

/**
 * Run the battery. `checks[].ok` is true, false, or null for a check
 * that was not reached (nothing runs on bytes that are not JSON), so
 * a fixture broken in one place never lights up checks about another.
 */
export function readSettlementResponse(raw) {
  const checks = [];
  const add = (check, ok, detail) => checks.push({ check, ok, detail });
  const decoded = decodeSettlementResponse(raw);
  add("json", decoded !== null, decoded ? "decodes (JSON, or base64 JSON) to an object" : "neither JSON nor base64 JSON, or not an object");
  if (!decoded) {
    for (const check of SETTLEMENT_RESPONSE_CHECKS.slice(1)) add(check, null, "not reached: the bytes did not decode");
    return finish(checks, null);
  }
  const { success, transaction, network, errorReason, payer, amount } = decoded;
  add("success-boolean", typeof success === "boolean", `success is ${describe(success)}; §5.3.2 requires a boolean`);
  add("transaction-string", typeof transaction === "string", `transaction is ${describe(transaction)}; §5.3.2 requires a string, empty when nothing was broadcast`);
  add("network-caip2", typeof network === "string" && CAIP2.test(network), `network is ${describe(network)}; §5.3.2 requires a CAIP-2 identifier such as eip155:8453`);
  add("error-reason-string", errorReason === undefined || typeof errorReason === "string", `errorReason is ${describe(errorReason)}; when present it is a string`);
  add("error-reason-on-success", !(success === true && errorReason !== undefined), success === true && errorReason !== undefined ? "errorReason present beside success:true; §5.3.2 omits it on success, so the response contradicts itself" : "no errorReason beside a success, or not a success");
  const pending = errorReason === PENDING;
  add(
    "pending-names-transaction",
    !pending || (typeof transaction === "string" && transaction.length > 0 && typeof network === "string" && network.length > 0),
    pending
      ? typeof transaction === "string" && transaction.length > 0
        ? "settlement_pending names the broadcast transaction and network, as §9 requires"
        : "settlement_pending with no transaction hash: §9 requires the broadcast hash and network so the caller can reconcile on chain"
      : "not settlement_pending; nothing to require",
  );
  add("payer-string", payer === undefined || typeof payer === "string", `payer is ${describe(payer)}; when present it is a string`);
  add("amount-atomic", amount === undefined || (typeof amount === "string" && ATOMIC.test(amount)), `amount is ${describe(amount)}; when present it is atomic units as a digit string`);
  return finish(checks, decoded);
}

function finish(checks, decoded) {
  const failed = checks.filter((entry) => entry.ok === false).map((entry) => entry.check);
  const ok = (name) => checks.find((entry) => entry.check === name)?.ok === true;
  let outcome;
  let reading;
  if (!decoded) {
    outcome = "unresolved";
    reading = "Unreadable bytes are not a settlement response. A reader holding them holds no settlement outcome: unresolved, never failed.";
  } else if (!ok("success-boolean") || !ok("transaction-string") || !ok("error-reason-string") || !ok("error-reason-on-success")) {
    outcome = "unresolved";
    reading = "The response cannot say whether anything moved: a required field is the wrong type, or the response contradicts itself. Unresolved until the chain is asked; a reader must not conclude failed from bytes it cannot read.";
  } else if (decoded.errorReason === PENDING) {
    outcome = "unresolved";
    reading = "settlement_pending is non-terminal (§9): the transaction may still confirm. Reconcile on chain before deciding anything; do not issue a new payment challenge and do not present this to the payer as a failed payment.";
  } else if (decoded.success === true) {
    outcome = "settled";
    reading = "The facilitator says the settlement succeeded. That is its word; the chain's copy is what an attestation reads.";
  } else {
    outcome = "failed";
    reading = decoded.errorReason
      ? `The facilitator says the settlement failed, terminally: ${String(decoded.errorReason)}.`
      : "The facilitator says the settlement failed and names no reason; a reader learns that it failed and nothing about why.";
  }
  return { battery: SETTLEMENT_RESPONSE_BATTERY, outcome, reading, decoded, checks, failed };
}

function describe(value) {
  if (value === undefined) return "absent";
  if (value === null) return "null";
  if (typeof value === "string") return value.length ? `the string ${JSON.stringify(value.length > 48 ? `${value.slice(0, 45)}...` : value)}` : "the empty string";
  return `a ${Array.isArray(value) ? "array" : typeof value}`;
}
