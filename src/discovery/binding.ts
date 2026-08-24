/**
 * SUBJECT BINDING (joins thesis step 2, 2026-08-24).
 *
 * Coherence only works if you know what two surfaces are claiming to
 * describe. These are the identity kinds a passport can bind:
 * service, endpoint, tool, route, payee, signing key.
 *
 * TWO QUESTIONS, AND THEY ARE NOT THE SAME:
 *
 *   same_subject  — do these two claims describe the SAME door?
 *                   Allowed even when we fetched the claims from
 *                   different origins (a directory listing vs the
 *                   live 402). That is the join we sell.
 *
 *   same_operator — are these two subjects the same actor?
 *                   REFUSED. G2 is a keeper flag: payTo/key reuse
 *                   across hosts is identity resolution, and it
 *                   walks toward an accumulating record keyed to
 *                   an actor (rule 43). The function returns
 *                   `not_compared` with that reason. It does not
 *                   quietly answer.
 *
 * Strengths are facts, not scores: strong (normalized values
 * match), conflict (both sides stated a value and they differ),
 * not_compared (missing, different subject, or the refused
 * question). There is no "weak same-operator" — that would be
 * the flag in a costume.
 */

export const IDENTITY_KINDS = [
  "service_identity",
  "endpoint_identity",
  "tool_identity",
  "route_identity",
  "payee_identity",
  "signing_identity",
] as const;

export type IdentityKind = (typeof IDENTITY_KINDS)[number];

export type BindingQuestion = "same_subject" | "same_operator";

export type BindingStrength = "strong" | "conflict" | "not_compared";

export interface IdentityClaim {
  kind: IdentityKind;
  /** The value the surface asserted, as read. */
  value: string;
  /** Discovery surface that asserted it (mcp_card, live_402, …). */
  surface: string;
  /** Origin the claim is ABOUT — the subject. */
  about: string;
  /** Origin we fetched the claim FROM. Provenance, not identity. */
  fetched_from: string;
}

export interface Binding {
  kind: IdentityKind;
  question: BindingQuestion;
  strength: BindingStrength;
  left: IdentityClaim;
  right: IdentityClaim;
  /** Why this strength, in one sentence. */
  reason: string;
  /** The compared spelling, when a compare ran. */
  left_normalized?: string;
  right_normalized?: string;
}

const G2_REFUSAL =
  "same_operator is a keeper-flagged question (G2): payTo or key reuse across hosts is identity resolution, and this store does not mint an operator id. The values were not compared.";

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HEX_KEY = /^(0x)?[0-9a-fA-F]{64}$/;

export function isIdentityKind(value: unknown): value is IdentityKind {
  return (
    typeof value === "string" &&
    (IDENTITY_KINDS as readonly string[]).includes(value)
  );
}

/** Origin only — scheme + host + port, lowercase host. */
export function originOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.origin;
  } catch {
    return null;
  }
}

/**
 * Compare-ready spelling. EVM payTo and hex keys fold case; Solana
 * payTo does not (base58 is case-sensitive). Endpoints drop hash and
 * a trailing slash on the path. Everything else is trimmed.
 */
export function normalizeIdentity(kind: IdentityKind, value: string): string {
  const trimmed = value.trim();
  if (kind === "payee_identity" && EVM_ADDRESS.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  if (kind === "signing_identity" && HEX_KEY.test(trimmed)) {
    return trimmed.replace(/^0x/i, "").toLowerCase();
  }
  if (kind === "endpoint_identity") {
    try {
      const parsed = new URL(trimmed);
      const path =
        parsed.pathname.length > 1 && parsed.pathname.endsWith("/")
          ? parsed.pathname.slice(0, -1)
          : parsed.pathname;
      return `${parsed.origin}${path}${parsed.search}`;
    } catch {
      return trimmed;
    }
  }
  if (kind === "service_identity") {
    return trimmed.toLowerCase();
  }
  return trimmed;
}

export function compareClaims(
  left: IdentityClaim,
  right: IdentityClaim,
  question: BindingQuestion,
): Binding {
  if (question === "same_operator") {
    return {
      kind: left.kind,
      question,
      strength: "not_compared",
      left,
      right,
      reason: G2_REFUSAL,
    };
  }
  if (left.kind !== right.kind) {
    return {
      kind: left.kind,
      question,
      strength: "not_compared",
      left,
      right,
      reason: `kinds differ (${left.kind} vs ${right.kind}); a join compares one kind at a time`,
    };
  }
  const leftAbout = originOf(left.about) ?? left.about;
  const rightAbout = originOf(right.about) ?? right.about;
  if (leftAbout !== rightAbout) {
    return {
      kind: left.kind,
      question,
      strength: "not_compared",
      left,
      right,
      reason:
        "about origins differ — these claims describe different subjects. same_subject does not join them; same_operator is the refused question.",
    };
  }
  const leftNorm = normalizeIdentity(left.kind, left.value);
  const rightNorm = normalizeIdentity(right.kind, right.value);
  if (leftNorm === rightNorm) {
    return {
      kind: left.kind,
      question,
      strength: "strong",
      left,
      right,
      left_normalized: leftNorm,
      right_normalized: rightNorm,
      reason: `both sides state ${left.kind}=${leftNorm} about ${leftAbout}`,
    };
  }
  return {
    kind: left.kind,
    question,
    strength: "conflict",
    left,
    right,
    left_normalized: leftNorm,
    right_normalized: rightNorm,
    reason: `${left.surface} states ${left.kind}=${leftNorm}; ${right.surface} states ${right.kind}=${rightNorm} — same subject, different claim`,
  };
}

/**
 * For each kind both sides stated, compare every left value to every
 * right value. A kind present on only one side is not a conflict —
 * that is not_observed, and the caller records it as such. Empty
 * sides yield no bindings.
 */
export function bindClaims(
  left: readonly IdentityClaim[],
  right: readonly IdentityClaim[],
  question: BindingQuestion,
): Binding[] {
  const bindings: Binding[] = [];
  for (const kind of IDENTITY_KINDS) {
    const leftOfKind = left.filter((claim) => claim.kind === kind);
    const rightOfKind = right.filter((claim) => claim.kind === kind);
    if (leftOfKind.length === 0 || rightOfKind.length === 0) continue;
    for (const l of leftOfKind) {
      for (const r of rightOfKind) {
        bindings.push(compareClaims(l, r, question));
      }
    }
  }
  return bindings;
}

/**
 * SET JOIN — what a catalog compare actually is.
 *
 * bindClaims is pairwise (one payTo vs one payTo). Two menus each
 * stating twenty route ids would cartesian-product into 400
 * "conflicts" that are just different items. This matches on the
 * normalized value: shared, only-left, only-right. A non-empty
 * only-* is the disagreement a self-row fails on.
 */
export interface ClaimSetJoin {
  kind: IdentityKind;
  left_surface: string;
  right_surface: string;
  shared: string[];
  only_left: string[];
  only_right: string[];
}

export function joinClaimSets(
  left: readonly IdentityClaim[],
  right: readonly IdentityClaim[],
): ClaimSetJoin[] {
  const joins: ClaimSetJoin[] = [];
  for (const kind of IDENTITY_KINDS) {
    const leftOfKind = left.filter((claim) => claim.kind === kind);
    const rightOfKind = right.filter((claim) => claim.kind === kind);
    // Same skip as bindClaims: a kind only one side stated is
    // not_observed, not a catalog hole. MCP clusters name routes
    // and never endpoints; treating that as only_left would invent
    // a disagreement the surface did not make.
    if (leftOfKind.length === 0 || rightOfKind.length === 0) continue;
    const leftMap = new Map<string, IdentityClaim>();
    for (const claim of leftOfKind) {
      leftMap.set(normalizeIdentity(kind, claim.value), claim);
    }
    const rightMap = new Map<string, IdentityClaim>();
    for (const claim of rightOfKind) {
      rightMap.set(normalizeIdentity(kind, claim.value), claim);
    }
    const keys = new Set([...leftMap.keys(), ...rightMap.keys()]);
    const shared: string[] = [];
    const only_left: string[] = [];
    const only_right: string[] = [];
    for (const key of keys) {
      const hasL = leftMap.has(key);
      const hasR = rightMap.has(key);
      if (hasL && hasR) shared.push(key);
      else if (hasL) only_left.push(key);
      else only_right.push(key);
    }
    joins.push({
      kind,
      left_surface: leftOfKind[0]?.surface ?? "absent",
      right_surface: rightOfKind[0]?.surface ?? "absent",
      shared: shared.sort(),
      only_left: only_left.sort(),
      only_right: only_right.sort(),
    });
  }
  return joins;
}
