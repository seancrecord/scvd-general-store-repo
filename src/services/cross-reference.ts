import {
  CROSS_REF_ACCEPTED_FOR,
  isRecord,
  type CrossReference,
} from "@/types";

/**
 * CROSS-PLATFORM RECEIPT RECOGNITION — checking a pointer from one of
 * our certificates to another operator's artifact for the same event.
 *
 * WHAT IT IS FOR. Two small operators settle the same real event from
 * different sides: a purchase here, a donation row there. Each issues
 * its own signed artifact, and a cross-reference lets a third party
 * follow one to the other and satisfy itself that both operators
 * signed for the same thing. That is the whole claim.
 *
 * WHAT IT DOES NOT CLAIM, and the enum is locked to one value to keep
 * it that way: `issuer_verified_settlement` means "this happened, and
 * it was signed by a key we checked." It does not mean the goods were
 * good, the delivery happened, the counterpart is reputable, or that
 * either operator endorses the other. Observation, never verdict —
 * the same line the rest of this store runs on, and the guardrail CV
 * and causeclaw flagged independently.
 *
 * FAIL CLOSED, ALWAYS. Every step that cannot be completed returns
 * `verified: false` with the reason named. Never "assume true because
 * their server was down" — an unreachable counterpart is an unproven
 * claim, and an unproven claim about a third party is exactly the
 * thing that must not inherit our signature's credibility. This is
 * the opposite posture from decoration, which fails open, and it is
 * correct here for the same reason money fails closed: the artifact
 * is evidence, and evidence that overstates is worse than absent.
 *
 * THE SIGNATURE COVERS IT. cross_ref is inside CERT_FIELDS, so a
 * cross-reference cannot be added to a certificate after minting. See
 * the note there; the relayed spec proposed leaving it unsigned and
 * that would have been the `made_by` mistake with somebody else's
 * name on it.
 */

/** A counterpart's published key document, in the shape we can read. */
export interface CounterpartKeyDoc {
  /** The key in service now. */
  current?: { public_key?: unknown; in_service_from?: unknown };
  /** Keys that served and were retired, with the date they left. */
  retired?: unknown;
}

export interface CrossRefCheck {
  counterpart_issuer: string;
  counterpart_artifact_id: string;
  verified: boolean;
  /** Named for every outcome, pass or fail. A bare false teaches nothing. */
  reason: string;
  /** What the signed artifact claimed we did at mint time. */
  verified_at_mint: boolean;
  key_document_url?: string;
}

export interface CrossRefOptions {
  fetch?: typeof fetch;
  /** The date the artifact is claimed for; defaults to now. */
  asOf?: Date;
  /** Milliseconds to wait on a counterpart before giving up. */
  timeoutMs?: number;
}

/**
 * HOW LONG ANOTHER OPERATOR GETS TO ANSWER BEFORE WE STOP WAITING.
 *
 * This number exists because of a question the keeper asked that the
 * first cut got wrong: what happens if the counterpart goes away and
 * never comes back? A dead DNS entry fails fast, but a host that
 * ACCEPTS the connection and never responds does not — and this
 * resolution runs inside /api/verify, which is the endpoint this store
 * promises is free, forever, and works whether or not you bought the
 * thing. Without a bound, one silent counterpart makes our own core
 * promise hang.
 *
 * Three seconds is chosen against what the call is worth: it is a
 * courtesy lookup on a page whose PRIMARY answer — is this signature
 * genuine — never touches the network at all. Better to report "they
 * did not answer in time" quickly and truthfully than to hold a
 * stranger's verify request open hoping.
 */
export const COUNTERPART_TIMEOUT_MS = 3000;

/** Where a counterpart publishes its key history, by convention. */
export function counterpartKeyUrl(issuer: string): string | null {
  const host = String(issuer ?? "").trim().toLowerCase();
  // A hostname and nothing else: no scheme, no path, no credentials.
  // An issuer string is data from a signed artifact, but it is data a
  // buyer originally supplied, so it never becomes a URL unchecked.
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) {
    return null;
  }
  return `https://${host}/.well-known/scvd-signing-key`;
}

/**
 * Shape check only. A malformed cross_ref is rejected before anything
 * touches the network, because the enum is the guardrail and a value
 * outside it must never be treated as a narrower claim we happen not
 * to recognise.
 */
export function crossRefShapeProblem(value: unknown): string | null {
  if (!isRecord(value)) return "not an object";
  for (const field of [
    "counterpart_issuer",
    "counterpart_key_fingerprint",
    "counterpart_artifact_id",
  ]) {
    if (typeof value[field] !== "string" || value[field] === "") {
      return `${field} missing or not a string`;
    }
  }
  if (value["accepted_for"] !== CROSS_REF_ACCEPTED_FOR) {
    return `accepted_for must be "${CROSS_REF_ACCEPTED_FOR}" — v0 recognises exactly one claim, and an unrecognised one is refused rather than downgraded`;
  }
  if (typeof value["verified_at_mint"] !== "boolean") {
    return "verified_at_mint missing or not a boolean";
  }
  return null;
}

function retiredEntries(doc: CounterpartKeyDoc): Array<{
  public_key: string;
  retired_on: string;
}> {
  const raw = Array.isArray(doc.retired) ? doc.retired : [];
  const out: Array<{ public_key: string; retired_on: string }> = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const key = entry["public_key"];
    const retired = entry["retired_on"];
    if (typeof key === "string" && typeof retired === "string") {
      out.push({ public_key: key.toLowerCase(), retired_on: retired });
    }
  }
  return out;
}

/**
 * Was this key theirs, and was it theirs AT THE TIME?
 *
 * The same succession logic this store already runs on itself, pointed
 * outward: a key is acceptable if it is current, or if it is retired
 * and the artifact predates its retirement. A retired key that signed
 * before it was retired is still a valid signer for that artifact —
 * refusing those would break every historical cross-reference the
 * moment a counterpart rotated, which would teach operators that
 * rotating breaks their history.
 */
export function keyAcceptableAt(
  doc: CounterpartKeyDoc,
  fingerprint: string,
  asOf: Date,
): { ok: boolean; reason: string } {
  const wanted = String(fingerprint ?? "").toLowerCase();
  if (!wanted) return { ok: false, reason: "no key fingerprint to check" };

  const current = String(doc.current?.public_key ?? "").toLowerCase();
  if (current && current === wanted) {
    return { ok: true, reason: "key is the counterpart's current signing key" };
  }

  for (const entry of retiredEntries(doc)) {
    if (entry.public_key !== wanted) continue;
    const retiredOn = new Date(entry.retired_on).getTime();
    if (!Number.isFinite(retiredOn)) {
      return {
        ok: false,
        reason: `key is listed as retired but its retired_on (${entry.retired_on}) is unreadable, so whether it was in service at the time cannot be decided`,
      };
    }
    if (asOf.getTime() <= retiredOn) {
      return {
        ok: true,
        reason: `key was in service when this artifact was issued (retired ${entry.retired_on})`,
      };
    }
    return {
      ok: false,
      reason: `key was already retired on ${entry.retired_on}, before this artifact's date — a signature from it after retirement proves nothing`,
    };
  }

  return {
    ok: false,
    reason:
      "key appears nowhere in the counterpart's published history, neither current nor retired",
  };
}

/**
 * Resolve and check one cross-reference. Never throws; every failure
 * is a named `verified: false`.
 */
export async function verifyCrossReference(
  ref: CrossReference,
  options: CrossRefOptions = {},
): Promise<CrossRefCheck> {
  const asOf = options.asOf ?? new Date();
  const base: Omit<CrossRefCheck, "verified" | "reason"> = {
    counterpart_issuer: String(ref?.counterpart_issuer ?? ""),
    counterpart_artifact_id: String(ref?.counterpart_artifact_id ?? ""),
    verified_at_mint: Boolean(ref?.verified_at_mint),
  };

  const shape = crossRefShapeProblem(ref);
  if (shape) {
    return { ...base, verified: false, reason: `malformed reference: ${shape}` };
  }

  const url = counterpartKeyUrl(ref.counterpart_issuer);
  if (!url) {
    return {
      ...base,
      verified: false,
      reason: `"${ref.counterpart_issuer}" is not a plain hostname, so no key document location can be derived from it`,
    };
  }

  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) {
    return {
      ...base,
      verified: false,
      key_document_url: url,
      reason: "no fetch available to resolve the counterpart's key",
    };
  }

  let doc: CounterpartKeyDoc;
  try {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(options.timeoutMs ?? COUNTERPART_TIMEOUT_MS),
    });
    if (!response.ok) {
      return {
        ...base,
        verified: false,
        key_document_url: url,
        reason: `counterpart key document returned HTTP ${response.status}; an unreachable counterpart is an unproven claim, never an assumed one`,
      };
    }
    const parsed: unknown = await response.json();
    if (!isRecord(parsed)) {
      return {
        ...base,
        verified: false,
        key_document_url: url,
        reason: "counterpart key document is not a JSON object",
      };
    }
    const history = isRecord(parsed["key_history"])
      ? parsed["key_history"]
      : parsed;
    doc = {
      current: isRecord(history["current"])
        ? (history["current"] as CounterpartKeyDoc["current"])
        : undefined,
      retired: history["retired"],
    };
  } catch (error) {
    return {
      ...base,
      verified: false,
      key_document_url: url,
      reason: `counterpart key document unreachable: ${String(error)}`,
    };
  }

  const verdict = keyAcceptableAt(doc, ref.counterpart_key_fingerprint, asOf);
  return {
    ...base,
    verified: verdict.ok,
    key_document_url: url,
    /**
     * PRECISE ABOUT WHICH HALF WAS CHECKED. We resolved their KEY
     * against their own published history. We did NOT fetch their
     * artifact, so we have not confirmed that
     * `counterpart_artifact_id` exists over there or says anything in
     * particular. Calling that "verified" without the qualifier would
     * be the overclaim this whole feature is supposed to avoid — the
     * reader would think two operators agreed, when what actually
     * happened is that one of them named a key the other really owns.
     */
    reason: verdict.ok
      ? `${verdict.reason}. That resolves the ISSUER, not the artifact: we did not fetch ${base.counterpart_artifact_id || "their record"} and cannot say it exists or what it contains. Nothing here speaks to quality, delivery or endorsement.`
      : verdict.reason,
  };
}

/** Check every reference on a certificate. Order preserved. */
export async function verifyCrossReferences(
  refs: readonly CrossReference[] | undefined,
  options: CrossRefOptions = {},
): Promise<CrossRefCheck[]> {
  if (!Array.isArray(refs) || refs.length === 0) return [];
  const checks: CrossRefCheck[] = [];
  for (const ref of refs) {
    checks.push(await verifyCrossReference(ref, options));
  }
  return checks;
}

/** What a cross-reference block means, served beside every result. */
export const CROSS_REF_MEANING =
  "A cross-reference points from this certificate to a counterpart artifact another operator issued for the same event. `issuer_verified_settlement` is the only claim it can carry, and it is narrow on purpose: we resolved the counterpart's KEY against their own published history. We did not fetch their artifact, so this says nothing about whether that record exists or what it contains — and nothing at all about quality, delivery or endorsement. Verification fails closed: an unreachable counterpart reads as unverified, never as fine.";

/**
 * WHAT A DEAD COUNTERPART DOES TO THIS CERTIFICATE: NOTHING.
 *
 * Served beside the results because it is the first question anyone
 * sensible asks, and the answer is load-bearing. The certificate's own
 * signature is ours, over our own fields, checkable with our own
 * published key and no network at all. A counterpart that vanishes,
 * goes bust, or simply stops answering makes its cross-reference read
 * `verified: false` and changes nothing else — not the signature, not
 * `valid`, not the artifact.
 *
 * This is the whole reason the reference is a POINTER we sign rather
 * than a dependency we take. We never needed their permission to
 * issue a certificate and we do not need their continued existence to
 * keep one honest.
 */
export const CROSS_REF_INDEPENDENCE =
  "A cross-reference is a pointer, not a dependency. If the counterpart goes offline forever, its entry below reads verified:false and NOTHING else about this certificate changes — the signature is ours, over our own fields, and checks against our published key with no network involved. `valid` above never depends on anyone else's uptime.";
