/**
 * THE POOLED CORPUS's fixed terms (THE_TAB.md layer 3, built
 * 2026-08-10). The Tab's client half has been ready to send since
 * v0.2 and refused for want of an endpoint; this is the endpoint's
 * contract, stated once, on the store side.
 *
 * THE WIRE FORMAT IS A PROTOCOL, NOT A COPY. These enums restate what
 * a delta may carry — the same closed list THE_TAB.md §6 declares and
 * tab/tools.mjs enforces before sending. Both sides state the
 * protocol independently and refuse what falls outside it; neither
 * imports the other's internals, because the client is a published
 * npm package that will drift from this repo's HEAD the day somebody
 * installs it.
 */

export const TAB_DELTA_KINDS = ["opened", "outcome"] as const;
export type TabDeltaKind = (typeof TAB_DELTA_KINDS)[number];

/** A resolution, not a feeling — THE_TAB.md §6. */
export const TAB_DELTA_OUTCOMES = [
  "kept_past_conversion",
  "canceled_pre_conversion",
  "canceled_post_conversion",
  "replaced",
] as const;

/** The door's demands at signup — a fact about the TOOL (addendum #11). */
export const TAB_SIGNUP_FRICTION = [
  "agent_native",
  "email_only",
  "phone_required",
  "kyc_required",
  "human_only",
] as const;

/**
 * What a delta may carry, by kind. An allowlist on BOTH sides of the
 * wire (the client's red team F2): a field invented next month is
 * refused by name, here too, so the privacy sentence is enforced by
 * construction at the door that matters — this one, which the spec
 * says out loud is the only tollbooth a local file cannot edit around.
 */
export const TAB_DELTA_FIELDS: Record<TabDeltaKind, readonly string[]> = {
  opened: ["kind", "tool_name", "category", "week", "signup_friction"],
  outcome: [
    "kind",
    "tool_name",
    "category",
    "outcome",
    "weeks_held",
    "replaced_with",
  ],
};

/**
 * The flood gate. Contributions are free and anonymous, so the only
 * thing between the pool and a firehose is a ceiling. Five hundred a
 * day is two orders of magnitude above any honest early volume; the
 * day it binds is a day the keeper should hear about either way.
 */
export const TAB_POOL_DAILY_CAP = 500;

/** Sample-size listing cap; past it the counts say so. */
export const TAB_POOL_SCAN_CAP = 2000;

export const TAB_POOL_PRIVACY_SENTENCE =
  "A delta carries: tool name, category, and either the signup week (with the door's demands) or the outcome with weeks held rounded to the week. Never: prices, payment methods, problem text, notes, identities, or any date finer than a week. Unknown fields are refused by name, on both sides of the wire.";

/**
 * Gaming, named on the artifact — the second of the two debts
 * THE_TAB.md says are owed BEFORE layer 3 ships. Sunlight, not a
 * promise of resistance.
 */
export const TAB_POOL_GAMING_NOTE =
  "Contributions are self-reported and anonymous, so a vendor can feed its own pool. Sample sizes ride every figure so a reader can see how little a number rests on; a figure built on four reports says four. What would make the number lie: coordinated self-reports, which no filter here can detect — the defence is stating that plainly, not pretending to resist it.";

/** The aggregate's trust-model line, verbatim from the keeper's ruling. */
export const TAB_POOL_TRUST_LINE =
  "Self-reported by contributing agents, unverified individually, aggregated and signed by us — the signature covers the arithmetic, never the truth of any single report.";
