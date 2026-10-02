/** Version metadata is dependency-free so public copy can derive it safely. */
export const PREFLIGHT_VERSION = "v1";

/**
 * The battery's citable name (roadmap 1.3 / D6): what a signed row
 * writes INSIDE its bytes to say which criteria produced the verdict.
 * Derived here, beside the version, so the audit's citation and the
 * rows' citations cannot drift apart.
 */
export const PREFLIGHT_BATTERY = `preflight-${PREFLIGHT_VERSION}`;

/** Old batteries keep their scoring rules; one observation can run all three. */
export const PREFLIGHT_VERSION_V2 = "v2";
/** S8: discovery/schema and offer/challenge contradictions now affect readiness. */
export const PREFLIGHT_VERSION_V3 = "v3";
export const PREFLIGHT_VERSION_NEXT = PREFLIGHT_VERSION_V3;

/**
 * The current battery's citable name, DERIVED like v1's rather than typed. A citation
 * that can drift from the version it names is the defect 2.5 fixes;
 * it would be a poor joke to reintroduce it in the fix.
 */
export const PREFLIGHT_BATTERY_NEXT = `preflight-${PREFLIGHT_VERSION_NEXT}`;

/** Every battery currently served. Ordered oldest first. */
export const PREFLIGHT_VERSIONS = [
  PREFLIGHT_VERSION,
  PREFLIGHT_VERSION_V2,
  PREFLIGHT_VERSION_V3,
] as const;

export type PreflightBattery = (typeof PREFLIGHT_VERSIONS)[number];

/** The date v2 began rendering verdicts. Its series starts here. */
export const PREFLIGHT_V2_SINCE = "2026-08-23";
export const PREFLIGHT_V3_SINCE = "2026-10-02";

/**
 * What each battery folds into its verdict. Stated as data rather than
 * prose so the criteria page cannot drift from the code that renders
 * the verdict — the same derive-or-refuse rule the rest of the store
 * lives under.
 */
const V2_ADDS = [
  "payto-payable",
  "amount-atomic",
  "network-mainnet",
  "transfer-method-signable",
  "solana-rail-receivable",
] as const;
export const CROSS_SURFACE_CHECK_NAMES = [
  "discovery-info-validates",
  "offer-amount-matches-accepts",
] as const;
/** Additions relative to the frozen v1 core, not the preceding version. */
export const BATTERY_ADDS: Record<PreflightBattery, readonly string[]> = {
  v1: [],
  v2: V2_ADDS,
  v3: [...V2_ADDS, ...CROSS_SURFACE_CHECK_NAMES],
};


/** Checks a battery MAY fold into its verdict beyond the core. */
export const VERDICT_FOLD_CHECK_NAMES = [
  ...V2_ADDS,
  ...CROSS_SURFACE_CHECK_NAMES,
] as const;
