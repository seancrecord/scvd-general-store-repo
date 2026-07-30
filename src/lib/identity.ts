/**
 * THE STORE'S OUTBOUND IDENTITY — one string, every call site.
 *
 * Keeper-approved 2026-07-30 after another x402 service was found
 * setting a custom user-agent that doubles as a backlink on every
 * outbound request it makes. In an economy where logs are read by other
 * agents and crawlers, that is free, permanent, compounding
 * self-citation, and it costs nothing to do properly.
 *
 * INFRASTRUCTURE, NOT VOICE. These strings are read by log parsers and
 * indexers, not people. No flourish, no house voice, nothing that
 * overstates what the store is. Every one is already true today.
 *
 * THE NAMING LAW DECIDES WHICH NAME GOES WHERE, and the split is the
 * whole reason this lives in one file:
 *   - TIER 1 (machine identifier, "scvd-general-store") in the
 *     user-agent product token, which is a machine field.
 *   - TIER 2 (display name, "SCVD General Store") in the response
 *     header, which a human reads in a devtools panel.
 * Getting that backwards is exactly the drift the naming law was
 * pinned to stop.
 *
 * ONE STRING, NOT PER-CALL-SITE. A user-agent that varies by caller is
 * worse than none: it fragments the very citation it exists to
 * accumulate, and nobody grepping a log would ever see the whole of us.
 */

/** Tier 1 slug. Sent on every outbound request the store makes as itself. */
export const OUTBOUND_USER_AGENT =
  "scvd-general-store/1.0 (+https://scvd.store)";

/** Tier 2 display name plus the domain, for a header a person reads. */
export const STORE_HEADER = "SCVD General Store (https://scvd.store)";

/**
 * Outbound headers with the store's identity attached. Callers spread
 * their own headers after, so nothing here can silently override a
 * content type or an authorization a call site needs.
 */
export function outboundHeaders(
  extra: Record<string, string> = {},
): Record<string, string> {
  return { "User-Agent": OUTBOUND_USER_AGENT, ...extra };
}
