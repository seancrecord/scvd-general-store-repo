/**
 * THE TWO AXES, NAMED APART (2026-09-21).
 *
 * The office had four different words for this and no agreement among
 * them. "Surface" meant a URL path on the desk, a protocol entry point
 * in the field study, and a discovery document in the ward's reader.
 * "Protocol" meant a payment rail at the till and what somebody else's
 * door speaks on the ward. "Door" meant one of ours and one of theirs.
 * "Channel" was a fourth axis again.
 *
 * Underneath all of it are two independent facts about one purchase:
 *
 *   RAIL     how the money moved            x402, mpp
 *   SURFACE  how the buyer got to the till  http, mcp, webmcp, ucp, a2a
 *
 * A UCP checkout paid with MPP is `surface: ucp, rail: mpp`. Asked to
 * live in one column it reported as "mpp" and the UCP half fell on the
 * floor — which is why the office could read MPP in two places, UCP in
 * none, and could not answer "what do we speak" at all.
 *
 * NEVER MULTIPLIED, NEVER ADDED. The same discipline the public /rails
 * page already prints: these are counts along two dimensions of the
 * same purchases, not a grid of separate sales. One purchase is one row
 * on each axis. Summing across axes double-counts every sale.
 *
 * This list was not invented here. It is the field study's
 * STUDY_SURFACES, which has been the only correct six-way vocabulary in
 * the tree since it was written, used by exactly one instrument. It is
 * promoted rather than copied, and field-study.ts re-exports it, so
 * there remains one list and the study's declared-surface column keeps
 * meaning precisely what it meant.
 */

/** How the money moved. The till's own two lanes. */
export const PAYMENT_RAILS = ["x402", "mpp"] as const;
export type PaymentRail = (typeof PAYMENT_RAILS)[number];

/**
 * How the buyer reached the till.
 *
 * `x402_http` is spelled that way because the field study asks a buyer
 * which one they used, and "http" alone reads to an agent as "not the
 * MCP one" rather than "a plain buy_url paid with a payment header".
 * The books' own door field is the narrower `PurchaseDoor`
 * (services/purchase-intent): four of these are indistinguishable once
 * a request arrives, and that gap is recorded rather than papered over.
 */
export const BUYER_SURFACES = [
  "x402_http",
  "mpp",
  "ucp",
  "webmcp",
  "mcp",
  "a2a",
] as const;
export type BuyerSurface = (typeof BUYER_SURFACES)[number];

export const BUYER_SURFACE_NOTES: Readonly<Record<BuyerSurface, string>> = {
  x402_http: "a plain HTTP buy_url paid with an x402 payment header",
  mpp: "the native MPP challenge (WWW-Authenticate: Payment) on any door that offers one",
  ucp: "the UCP checkout — create, then settle",
  webmcp: "the browser surface: document.modelContext tools on our pages",
  mcp: "the MCP server's buy_* tools over JSON-RPC",
  a2a: "the A2A desk, agent card and task",
};

/**
 * A2A IS AN ORIGIN, NOT A TILL.
 *
 * The desk is free (freeA2ACheck), the evidence agent is free and says
 * so ("Nothing paid"), and the one paid thing behind it — the repair
 * kit — is bought over x402 on the HTTP door. So an A2A-driven purchase
 * lands on `http` or `mcp` in our books and always will. Counting A2A
 * in a settle column would invent a number; it is counted where it is
 * real, in what was asked and read.
 *
 * The field study already encodes the same fact in its expectedDoor
 * table. This is that fact, said once, where a page can read it.
 */
export const SURFACES_THAT_NEVER_SETTLE: readonly BuyerSurface[] = ["a2a"];

export function settlesHere(surface: BuyerSurface): boolean {
  return !SURFACES_THAT_NEVER_SETTLE.includes(surface);
}
