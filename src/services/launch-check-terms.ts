/**
 * THE LAUNCH CHECK'S TERMS, in a module that cannot pay.
 *
 * Roadmap N9 (2026-09-02): the collector must not be able to reach a
 * signing-capable code path, as a property of the import graph rather
 * than a policy. The menu, the bazaar schema and the specimens quote
 * these numbers in copy, and until this file existed they imported
 * them from launch-check.ts — which is the one module that can sign an
 * EIP-3009 authorization from the field wallet. Every probe root
 * (the ward round, the preflight, the watches, the refresh) reached
 * the signer through the menu. Nothing ever called it from there;
 * that is a policy, and test/collector-cannot-pay.spec.ts wanted a
 * property. So the terms live here, importing nothing, and
 * launch-check.ts re-exports them for the callers that pay.
 */

/** The walkabout envelope, launch-check variant — same calling card,
 * honest about which program knocked. */
export const LAUNCH_CHECK_UA =
  "scvd-walkabout/1.0 (+https://scvd.store/what) x402-launch-check";

/** The most a check ever pays out, in USD. WALKABOUT.md rule 1's
 * per-item default; raising it is the keeper's call, here in code. */
export const FIELD_SPEND_CAP_USD = 0.05;

/**
 * The walk's citable battery name (roadmap 1.3 / D6): the fifteen
 * stages ARE the battery, and a signed walk record now names which
 * revision of them produced it. Bump when a stage is added, removed,
 * or changes meaning — replay_rejected's arrival on 2026-08-23 is
 * the kind of change that would have bumped this had it existed.
 *
 * v2, 2026-08-28 (the instrument audit): the offers stage changed
 * meaning. v1 read signed offers off the header-wins challenge
 * object only, so "no signed offers carried in the challenge" in a
 * v1 record means "none in the placement the walk read" — a door
 * with body-placed offers behind a header challenge was told it
 * carried none. v2 reads both placements and asserts absence only
 * over both.
 *
 * v3, 2026-09-12 (the x402 spec thread's receiver obligation): the
 * replay stage changed meaning. v2 read every non-2xx on the replay
 * as a correct refusal — a 402 carrying fresh terms included — and
 * every 2xx as the goods served again. v3 reads the answer four ways
 * (served again, re-delivered, re-challenged, refused, or unknown)
 * and says whether it named the original settlement, in a signed
 * `replay` object beside the tri-state `replay_served`. A v2 record's
 * "refused, correctly" therefore means "not a 2xx" and nothing finer.
 */
export const LAUNCH_CHECK_BATTERY = "launch-check-v3";

/**
 * THE LONGEST AUTHORIZATION THIS STORE WILL EVER SIGN (ledger I2).
 *
 * `validBefore` used to be `now + the SELLER'S maxTimeoutSeconds`,
 * uncapped. The seller writes that number. A door asking for ten
 * years received a signed, submittable EIP-3009 authorization against
 * the field wallet good for ten years, and the walk then ended,
 * because from our side the check was over.
 *
 * Ten minutes is longer than any honest settlement needs and short
 * enough that an unpresented authorization stops being a liability
 * while the keeper is still awake. The seller may ask for less; it
 * may never ask for more.
 */
export const MAX_AUTHORIZATION_SECONDS = 600;
