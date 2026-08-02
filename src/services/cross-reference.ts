import { isAllowedCounterpart } from "@/store/counterparts";
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
  /** Test seam for the allowlist. Production always uses the real one. */
  allowHost?: (issuer: string) => boolean;
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

/**
 * HOW MANY REFERENCES ONE CERTIFICATE MAY CARRY.
 *
 * A cap, because without one a single certificate could name a
 * thousand counterparts and every public verification of it would fan
 * out into a thousand outbound requests — a self-inflicted denial of
 * service that doubles as an attack tool aimed at whoever was listed.
 * Four is generous for the actual use: an event settled from two or
 * three sides. Anything past the cap is REPORTED, never silently
 * dropped, because a truncation nobody is told about is the failure
 * this codebase already has a rule against.
 */
export const MAX_CROSS_REFS = 4;

/** Bytes we will read from a counterpart before giving up. */
export const MAX_KEY_DOC_BYTES = 64 * 1024;

/** How long a counterpart's key document is reused within an isolate. */
export const COUNTERPART_CACHE_MS = 300_000;

/**
 * WHY THERE IS A CACHE AT ALL, and it is not about speed.
 *
 * /api/verify is free, unlimited and public. Without memoisation,
 * anyone could loop a verify URL and make this store hammer whichever
 * counterpart that certificate names — turning our own most
 * open-handed promise into a weapon pointed at a partner. The cache
 * bounds a stranger's ability to spend somebody else's bandwidth
 * through us, and incidentally stops us leaking a precise verification
 * rhythm to the host being referenced.
 *
 * Bounded by construction: keys are allowlisted hosts, so this map
 * cannot grow past the number of counterparts we chose.
 */
const keyDocCache = new Map<
  string,
  { at: number; doc: CounterpartKeyDoc | null; failure?: string }
>();

/** Test seam: drop memoised counterpart documents. */
export function clearCounterpartCache(): void {
  keyDocCache.clear();
}

/** Where a counterpart publishes its key history, by convention. */
/**
 * Suffixes that resolve inside a network rather than on the internet.
 * Belt to the allowlist's braces: if an entry is ever added here by
 * mistake, these still refuse.
 */
const INTERNAL_SUFFIXES = [
  ".internal",
  ".local",
  ".localhost",
  ".home.arpa",
  ".localdomain",
  ".intranet",
  ".corp",
  ".lan",
];

/**
 * Hosts whose LABELS are an IP address wearing a domain suffix —
 * 127.0.0.1.nip.io, 10.0.0.1.sslip.io and every clone. A bare-hostname
 * regex passes these happily because they end in a real TLD, and they
 * resolve straight back to the loopback or a private range.
 */
const IP_IN_DISGUISE =
  /(^|\.)(\d{1,3}[.-]\d{1,3}[.-]\d{1,3}[.-]\d{1,3})(\.|$)/;

export function counterpartKeyUrl(issuer: string): string | null {
  const host = String(issuer ?? "").trim().toLowerCase();
  /**
   * A hostname and nothing else: no scheme, no path, no credentials,
   * no port. The issuer arrives inside a signed artifact, but it was
   * originally supplied from outside, so it never becomes a URL
   * unchecked.
   */
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) {
    return null;
  }
  // A hostname long enough to be a payload is not a hostname.
  if (host.length > 253) return null;
  if (host.split(".").some((label) => label.length === 0 || label.length > 63)) {
    return null;
  }
  if (INTERNAL_SUFFIXES.some((suffix) => host.endsWith(suffix))) return null;
  if (IP_IN_DISGUISE.test(host)) return null;
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

/**
 * One spelling for a key on both sides of a comparison. A counterpart
 * writing `0xabc…` where we wrote `abc…` is the same key, and letting
 * that read as "appears nowhere in their history" would be a false
 * accusation dressed as a security finding.
 */
function normalizeKey(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/^0x/, "");
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
      out.push({ public_key: normalizeKey(key), retired_on: retired });
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
  const wanted = normalizeKey(fingerprint);
  if (!wanted) return { ok: false, reason: "no key fingerprint to check" };

  const current = normalizeKey(doc.current?.public_key);
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

  /**
   * THE ALLOWLIST, CHECKED BEFORE ANYTHING IS PARSED OR FETCHED. Every
   * clever URL filter is a game of catching the next bypass, and the
   * defender loses that game eventually. A host we did not choose is
   * simply never contacted.
   */
  if (!(options.allowHost ?? isAllowedCounterpart)(ref.counterpart_issuer)) {
    return {
      ...base,
      verified: false,
      reason: `"${ref.counterpart_issuer}" is not a counterpart this store resolves. Nothing was fetched. Being absent from that list is not a judgment about them — it means no request will be made to a host we did not deliberately add.`,
    };
  }

  const url = counterpartKeyUrl(ref.counterpart_issuer);
  if (!url) {
    return {
      ...base,
      verified: false,
      reason: `"${ref.counterpart_issuer}" is not a plain public hostname, so no key document location can be derived from it`,
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
  const now = Date.now();
  const cached = keyDocCache.get(url);
  if (cached && now - cached.at < COUNTERPART_CACHE_MS) {
    if (!cached.doc) {
      return {
        ...base,
        verified: false,
        key_document_url: url,
        reason: `${cached.failure ?? "counterpart unreachable"} (remembered from a recent attempt rather than re-asking, so a public verify loop cannot be aimed at them through us)`,
      };
    }
    doc = cached.doc;
  } else {
    try {
      const response = await fetchImpl(url, {
        signal: AbortSignal.timeout(options.timeoutMs ?? COUNTERPART_TIMEOUT_MS),
        /**
         * NO REDIRECTS. Following one would hand an attacker the
         * bypass the allowlist exists to prevent: an allowed host
         * answering 302 to a link-local address turns our verifier
         * into a request emitter aimed anywhere.
         */
        redirect: "error",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        const failure = `counterpart key document returned HTTP ${response.status}; an unreachable counterpart is an unproven claim, never an assumed one`;
        keyDocCache.set(url, { at: now, doc: null, failure });
        return { ...base, verified: false, key_document_url: url, reason: failure };
      }
      /**
       * READ AS TEXT WITH A CEILING, then parse. `.json()` on an
       * unbounded body is a memory exhaustion invitation from a host
       * we do not control, and the declared Content-Length cannot be
       * trusted to describe what actually arrives.
       */
      const raw = await response.text();
      if (raw.length > MAX_KEY_DOC_BYTES) {
        const failure = `counterpart key document exceeds ${MAX_KEY_DOC_BYTES} bytes and was not parsed`;
        keyDocCache.set(url, { at: now, doc: null, failure });
        return { ...base, verified: false, key_document_url: url, reason: failure };
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        const failure = "counterpart key document is not valid JSON";
        keyDocCache.set(url, { at: now, doc: null, failure });
        return { ...base, verified: false, key_document_url: url, reason: failure };
      }
      if (!isRecord(parsed)) {
        const failure = "counterpart key document is not a JSON object";
        keyDocCache.set(url, { at: now, doc: null, failure });
        return { ...base, verified: false, key_document_url: url, reason: failure };
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
      keyDocCache.set(url, { at: now, doc });
    } catch (error) {
      const failure = `counterpart key document unreachable: ${String(error)}`;
      keyDocCache.set(url, { at: now, doc: null, failure });
      return { ...base, verified: false, key_document_url: url, reason: failure };
    }
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
  /**
   * DEDUPED, so a certificate naming the same counterpart artifact
   * fifty times costs one lookup rather than fifty. Without this the
   * cap alone would still let a handful of entries multiply work.
   */
  const seen = new Set<string>();
  for (const ref of refs.slice(0, MAX_CROSS_REFS)) {
    const fingerprint = `${String(ref?.counterpart_issuer)}|${String(ref?.counterpart_artifact_id)}`;
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    checks.push(await verifyCrossReference(ref, options));
  }
  /**
   * SAID OUT LOUD, never silent. A capped list that reads as complete
   * is the failure mode AT_SCALE rule 4 exists for, and here it would
   * hide references from exactly the reader trying to audit them.
   */
  if (refs.length > MAX_CROSS_REFS) {
    checks.push({
      counterpart_issuer: "",
      counterpart_artifact_id: "",
      verified: false,
      verified_at_mint: false,
      reason: `This certificate carries ${refs.length} cross-references and only the first ${MAX_CROSS_REFS} were checked. The cap exists so one artifact cannot fan a single public verification out into unbounded outbound requests. The remainder are NOT verified and must not be read as such.`,
    });
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
