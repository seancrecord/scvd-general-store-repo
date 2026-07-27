/**
 * THE TRUST LIST, v0 — the format, not the vouching.
 *
 * Spec: GROWTH_TASKS A3 and DEMAND_SYNTHESIS Part 7, Move 2. In a
 * field where most listings don't return a valid 402, agents have
 * nowhere to check which endpoints actually deliver. This is the
 * beginning of somewhere.
 *
 * v0 LISTS ONLY THIS STORE. That it exists and has a schema is the
 * point; size comes later, and adding anyone else is hard-gated on
 * the first organic settle — we cannot be the trust anchor for a
 * flow we have never completed with a stranger.
 *
 * THE SCOPE GUARD, which is the whole liability edge:
 *
 *   It attests OBSERVATION — "checked on {date}: exists, delivered,
 *   refunded on miss." A timestamped statement about a PAST fact.
 *
 *   It never says SAFE, RECOMMENDED, or TRUSTED. Those are
 *   predictions about someone else's future behaviour, and they put
 *   this store's signature on a vouch it cannot control. The same
 *   settlement-versus-delivery discipline, applied to reputation.
 *
 * ⚑ Keeper's pen on the wording of any entry. The bar for inclusion
 * is not "seems legit" — it is "I did the thing and it delivered."
 */

export type TrustListStatus = "verified" | "unreachable" | "removed";

export interface TrustListEntry {
  /** The origin checked. Not a deep link; the thing that either exists or doesn't. */
  origin: string;
  /** What was transacted, in general terms. Never private detail. */
  transacted: string;
  /** ISO date the keeper first verified it by doing the thing. */
  first_verified: string;
  /** ISO date of the most recent check. */
  last_checked: string;
  status: TrustListStatus;
}

/**
 * The list itself. One entry, and it is us — which is the honest
 * starting position for a registry whose whole claim is that someone
 * actually went and looked.
 */
export const TRUST_LIST_ENTRIES: readonly TrustListEntry[] = [
  {
    origin: "https://scvd.store",
    transacted:
      "Purchases across the full shelf, paid over x402 v2 on Base, each one settling before anything shipped and each one minting a certificate that still verifies.",
    first_verified: "2026-07-22",
    last_checked: "2026-07-27",
    status: "verified",
  },
] as const;

/** What the list claims, stated where it cannot be missed. */
export const TRUST_LIST_ATTESTS =
  "Each entry records that the keeper transacted with the origin on the date shown and it delivered. That is an observation about a past event, signed. It is not a claim that the origin is safe, recommended, or will behave the same tomorrow — nobody can sign for someone else's future.";

/** Why v0 lists only one thing, said plainly rather than hidden. */
export const TRUST_LIST_V0_NOTE =
  "Version 0 lists only this store. The format and the signature are the point; the list grows by hand, one origin at a time, and only after the keeper has personally transacted. Adding others waits on this store completing a purchase with a stranger, because a trust anchor for a flow we have never finished would be worth nothing.";
