import { jcsCanonicalize } from "@/lib/jcs";
import { isRecord } from "@/types";

/**
 * response-provenance: re-derive an issuer's `responseHash` from the body it claims to describe.
 *
 * WHY THIS IS A SEPARATE BLOCK RATHER THAN ANOTHER ENTRY IN `checks`.
 * Every entry in `checks` answers a question about the ARTIFACT — is this JWS well-formed, signed by
 * the key it names, unexpired. This answers a question about a PAIR: an artifact and the response body
 * it claims to describe. Most callers have no body to supply and no reason to; folding a body-shaped
 * check into the frozen verdict would mark every ordinary caller non-conformant for not carrying one.
 * So, exactly like `anchored_key_history`, it rides as its own block, present only when the caller opts
 * in with `response_provenance`, and NEVER folded into `verdict`.
 *
 * WHAT IT PROVES, AND WHAT IT REFUSES TO.
 * A receipt proves payment and issuer. It cannot reach the response body. A GVP `responseHash` is a
 * SHA-256 over the RFC 8785 (JCS) canonical form of the closed five-member fixed point
 * {endpoint, inputs, result, method, dataVintage}, which anyone holding the body can recompute — no key,
 * no origin fetch. This block recomputes it FROM THE BODY THE CALLER GAVE US. It never fetches the
 * issuer's origin, so its verdict is about the pair supplied, never a claim that the issuer served it.
 *
 * THE FINDING IS A DISJUNCTION, NOT AN ATTRIBUTION.
 * A failed re-derivation means the artifact was altered OR it was issued in violation of GVP §2.1.2
 * (a result depending on inputs outside the fixed point). Both are defects; telling them apart needs the
 * issuer's internals, which a desk cannot see, so this states both branches and names neither.
 *
 * SELF-EXCLUSION (GVP §8.1).
 * A third failure exists and it is ours: our own canonicalizer could be wrong, and JCS is exactly where
 * that hides. So before this block may state a finding it re-derives a small set of published GVP vectors
 * with THIS desk's `jcsCanonicalize`. If that disagrees, the block reports `self_ok: false` about itself,
 * carries no class slug, and states no finding about anyone. That is also the place a disagreement between
 * this desk's RFC 8785 implementation and GVP's would surface — on the public record the day it happens.
 *
 * Spec: https://github.com/SolomonisBlack/golden-vector-provenance/blob/main/spec/gvp-0.2.md
 * Offered from x402-foundation/x402#3234 -> seancrecord/scvd-general-store-repo#193.
 */

export const RESPONSE_PROVENANCE_CLASS = "response-hash-not-rederivable" as const;

/**
 * Ceiling on the serialized response_provenance payload, mirroring the artifact ceiling. Canonicalization
 * already degrades gracefully on pathological input (deep nesting, many keys — see the catch below), so
 * this is symmetry and a stated bound, not a hole being closed.
 */
export const MAX_RESPONSE_PROVENANCE_CHARS = 65_536;

export const FIXED_POINT_MEMBERS = [
  "endpoint",
  "inputs",
  "result",
  "method",
  "dataVintage",
] as const;

/** The result block. Present on the verdict only when `response_provenance` was supplied. */
export interface ProvenanceFinding {
  /** false = the response carried no `provenance.responseHash`, so this class does not apply. */
  applies: boolean;
  /** GVP §8.1: did THIS desk's canonicalizer reproduce the published vectors? A claim about us. */
  self_ok: boolean;
  /** The vocabulary slug, present ONLY on an actual finding. null on pass / n/a / self-failure. */
  class: string | null;
  /** true = re-derived and matched · false = a finding · null = did not run (n/a or self-failure). */
  ok: boolean | null;
  detail: string;
  /** On a finding: the disjunction, naming neither branch. */
  asserts?: string;
  /** On a finding: what observation would disprove it. */
  falsified_by?: string;
  /** On a finding: the scope limit this desk states on every verdict. */
  scope?: string;
  recomputed?: string;
  declared?: string;
}

// ---- GVP §8.1 fit vectors (published; embedded so the check is offline) ----------------------------
// The desk's own jcsCanonicalize MUST reproduce every canonical form and every digest below before this
// block may state a finding. Regenerate from golden-vector-provenance vectors/ if GVP re-publishes them.
const FIT_CANON: ReadonlyArray<{ value: unknown; canonical: string }> = [
  { value: { b: 1, a: 2, C: 3 }, canonical: '{"C":3,"a":2,"b":1}' },
  { value: { s: "café — 日本語" }, canonical: '{"s":"café — 日本語"}' },
  { value: { s: "a\u0000b\u001fc" }, canonical: '{"s":"a\\u0000b\\u001fc"}' },
  { value: { n: -0 }, canonical: '{"n":0}' },
  { value: { a: 1e21, b: 5e-324, c: 1500 }, canonical: '{"a":1e+21,"b":5e-324,"c":1500}' },
  { value: { a: [[1, [2]], { b: [3] }] }, canonical: '{"a":[[1,[2]],{"b":[3]}]}' },
];

const FIT_DIGESTS: ReadonlyArray<{ fixedPoint: Record<string, unknown>; expectedHash: string }> = [
  {
    fixedPoint: {
      endpoint: "/v1/self-employment-tax",
      inputs: { netProfit: 80000, filingStatus: "single", w2SocialSecurityWages: 0 },
      result: {
        netEarningsFromSelfEmployment: 73880,
        socialSecurityPortion: 9161.12,
        medicarePortion: 2142.52,
        additionalMedicare: 0,
        selfEmploymentTax: 11303.64,
        deductibleHalf: 5651.82,
      },
      method: "Schedule SE: net earnings = profit x 0.9235; SS 12.4% to wage base; Medicare 2.9%",
      dataVintage: "2026.0",
    },
    expectedHash: "sha256:94f78e0d472e97db6b590f1b54e778d6065d7a18e5a3d2a324b17adb48a6e771",
  },
  {
    fixedPoint: {
      endpoint: "/v1/paycheck",
      inputs: { salary: 150000, state: "CA", filingStatus: "single", payFrequency: "biweekly" },
      result: { stateName: "California", federalTax: 24734, stateTax: 10388.64, netAnnual: 103402.36 },
      method: "2026 brackets; state marginal ladder applied to gross",
      dataVintage: "2026.0",
    },
    expectedHash: "sha256:5e46f391c0a085456dda884f5499bd1c7da07b47e6cf915d37ddd2ee677d62b5",
  },
];

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return "sha256:" + hex;
}

const stripPrefix = (h: string): string => (h.startsWith("sha256:") ? h.slice(7) : h);

/** GVP §8.1: prove THIS desk's canonicalizer reproduces the published vectors before accusing anyone. */
export async function canonicalizerIsFit(): Promise<boolean> {
  for (const v of FIT_CANON) {
    if (jcsCanonicalize(v.value) !== v.canonical) return false;
  }
  for (const v of FIT_DIGESTS) {
    if ((await sha256Hex(jcsCanonicalize(v.fixedPoint))) !== v.expectedHash) return false;
  }
  return true;
}

/**
 * Rebuild the closed five-member fixed point. The member set is a spec constant, never taken from the
 * artifact — an issuer that declared its own member list could shrink it (drop `inputs`) and stay
 * internally consistent. `inputs` is the body the caller supplied alongside the response.
 */
function fixedPointOf(response: Record<string, unknown>, inputs: unknown): Record<string, unknown> {
  const provenance = isRecord(response.provenance) ? response.provenance : {};
  return {
    endpoint: response.endpoint,
    inputs,
    result: response.result,
    method: provenance.method,
    dataVintage: provenance.dataVintage,
  };
}

/**
 * @param supplied  { response, inputs } — the response object and the body it describes. Never fetched.
 * @returns a ProvenanceFinding, always additive and never folded into the verdict.
 */
export async function checkResponseProvenance(supplied: unknown): Promise<ProvenanceFinding> {
  const req = isRecord(supplied) ? supplied : {};
  const response = isRecord(req.response) ? req.response : undefined;
  const inputs = req.inputs;

  // Symmetry with the artifact ceiling: refuse an oversized payload before doing work on it.
  let suppliedSize = 0;
  try {
    suppliedSize = JSON.stringify(supplied ?? null).length;
  } catch {
    return {
      applies: false,
      self_ok: true,
      class: null,
      ok: null,
      detail:
        "response_provenance could not be serialized (likely a circular structure); nothing was re-derived.",
    };
  }
  if (suppliedSize > MAX_RESPONSE_PROVENANCE_CHARS) {
    return {
      applies: false,
      self_ok: true,
      class: null,
      ok: null,
      detail: `response_provenance is ${suppliedSize} characters, over the ${MAX_RESPONSE_PROVENANCE_CHARS} ceiling. A response and its inputs are a few KB; something this size is not one.`,
    };
  }

  if (!response) {
    return {
      applies: false,
      self_ok: true,
      class: null,
      ok: null,
      detail:
        "response_provenance was supplied but carried no `response` object, so there was nothing to re-derive. Send { response, inputs } where response is a GVP answer that declares provenance.responseHash.",
    };
  }

  const provenance = isRecord(response.provenance) ? response.provenance : {};
  const declaredRaw = typeof provenance.responseHash === "string" ? provenance.responseHash : undefined;
  if (!declaredRaw) {
    return {
      applies: false,
      self_ok: true,
      class: null,
      ok: null,
      detail:
        "The response declares no provenance.responseHash, so this class does not apply. That is not a failure — an answer without a re-derivable hash is simply out of scope for this check.",
    };
  }

  if (!(await canonicalizerIsFit())) {
    // A claim about THIS desk (GVP §8.1). Deliberately no class slug: nothing downstream may mistake
    // our own broken arithmetic for an accusation against an issuer.
    return {
      applies: true,
      self_ok: false,
      class: null,
      ok: null,
      detail:
        "This desk's canonicalizer did not reproduce the published GVP vectors, so per GVP §8.1 it may not state a re-derivation finding. This says nothing about your artifact — it is a fault in this instrument. If you see this, the desk's JCS implementation and GVP's disagree, which is itself worth reporting.",
    };
  }

  const declared = stripPrefix(declaredRaw);
  const fixedPoint = fixedPointOf(response, inputs);
  const missing = FIXED_POINT_MEMBERS.filter((m) => fixedPoint[m] === undefined);
  if (missing.length > 0) {
    return {
      applies: true,
      self_ok: true,
      class: RESPONSE_PROVENANCE_CLASS,
      ok: false,
      detail: `The response declares a responseHash but omits fixed-point member(s): ${missing.join(", ")}.`,
      asserts:
        "The GVP fixed point is a closed five-member set {endpoint, inputs, result, method, dataVintage}; a hash over a subset is not a GVP responseHash. `inputs` and `method` are supplied via response_provenance and the response's provenance block respectively.",
      falsified_by:
        "the artifact carrying all five members with a hash that re-derives over exactly them",
      scope:
        "THIS IS THE ARTIFACT YOU GAVE US. We did not fetch it from the issuer origin and do not say they served it.",
      declared,
    };
  }

  let recomputed: string;
  let recomputedBare: string;
  try {
    recomputed = await sha256Hex(jcsCanonicalize(fixedPoint));
    recomputedBare = stripPrefix(recomputed);
  } catch (err) {
    return {
      applies: true,
      self_ok: true,
      class: null,
      ok: null,
      detail: `Canonicalization threw on the supplied body (${err instanceof Error ? err.message : String(err)}); no finding is stated.`,
    };
  }

  if (recomputedBare === declared) {
    return {
      applies: true,
      self_ok: true,
      // A pass is NOT a finding, so it carries no class slug — a defect-class name beside a host that
      // re-derived cleanly is a false accusation created by presentation, not observation.
      class: null,
      ok: true,
      detail:
        "The declared responseHash re-derives from the supplied body over the closed fixed point. This proves the response is unaltered and re-derivable — explicitly NOT that it is correct.",
      recomputed,
      declared,
    };
  }

  return {
    applies: true,
    self_ok: true,
    class: RESPONSE_PROVENANCE_CLASS,
    ok: false,
    detail:
      "The declared responseHash does not re-derive from the supplied body over the closed fixed point {endpoint, inputs, result, method, dataVintage}.",
    asserts:
      "Either the artifact was altered, or it was issued in violation of GVP §2.1.2 (a result depending on inputs outside the fixed point — a clock, a live feed, mutable state). Both are defects; this desk cannot and does not say which, because telling them apart needs the issuer's internals it cannot see.",
    falsified_by:
      "recomputing SHA-256 over the RFC 8785 (JCS) canonical form of {endpoint, inputs, result, method, dataVintage} from the same supplied body and obtaining the declared responseHash",
    scope:
      "THIS IS THE ARTIFACT YOU GAVE US. We did not fetch it from the issuer origin and do not say they served it.",
    recomputed,
    declared: declaredRaw,
  };
}
