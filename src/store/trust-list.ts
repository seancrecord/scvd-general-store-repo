/**
 * THE TRUST LIST, v1 — the format, and now the first neighbors.
 *
 * Spec: GROWTH_TASKS A3 and DEMAND_SYNTHESIS Part 7, Move 2. In a
 * field where most listings don't return a valid 402, agents have
 * nowhere to check which endpoints actually deliver. This is the
 * beginning of somewhere.
 *
 * WHAT CHANGED FROM v0, and why it does not break the gate.
 *
 * v0 listed only this store, with adding anyone else hard-gated on the
 * first organic settle. That gate exists for one reason, stated in the
 * spec: we cannot be the trust anchor for a FLOW WE HAVE NEVER
 * COMPLETED WITH A STRANGER. It guards the paid-transaction claim, and
 * it still does — no origin appears below as a completed x402 purchase
 * except this store, and none will until a stranger buys something.
 *
 * What v1 adds is a SECOND, WEAKER CLASS OF ENTRY that the gate was
 * never about: services the keeper used, that did the thing they said
 * they would, with no money moving either way. Every one of them is
 * already on the public Town Directory in the keeper's own words, and
 * the review text below is those words verbatim. Promoting a fact he
 * published into a list he signs adds no new claim; it only makes an
 * existing one checkable.
 *
 * THE TWO CLASSES ARE NEVER BLURRED, because the difference is the
 * whole value of the list:
 *
 *   "transacted" — money moved over x402 and the thing arrived.
 *   "used"       — the keeper used it and it worked. No payment.
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

/**
 * What actually happened between the keeper and the origin. The
 * strong claim and the weak one, never collapsed into each other.
 */
export type TrustListRelation = "transacted" | "used";

export interface TrustListEntry {
  /** The origin checked. Not a deep link; the thing that either exists or doesn't. */
  origin: string;
  /** Paid transaction, or unpaid use. The reader decides what that's worth. */
  relation: TrustListRelation;
  /** What was transacted, in general terms. Never private detail. */
  transacted: string;
  /** ISO date the keeper first verified it by doing the thing. */
  first_verified: string;
  /** ISO date of the most recent check. */
  last_checked: string;
  status: TrustListStatus;
}

/**
 * The list itself. One paid entry — us — and three neighbors the
 * keeper used while getting this store indexed. The review text is
 * his, lifted verbatim from the Town Directory; a list that
 * paraphrased him would be a list nobody wrote.
 */
export const TRUST_LIST_ENTRIES: readonly TrustListEntry[] = [
  {
    origin: "https://scvd.store",
    relation: "transacted",
    transacted:
      "Purchases across the full shelf, paid over x402 v2 on Base, each one settling before anything shipped and each one minting a certificate that still verifies.",
    first_verified: "2026-07-22",
    last_checked: "2026-07-27",
    status: "verified",
  },
  {
    origin: "https://www.x402scan.com",
    relation: "used",
    transacted:
      "Reads the /.well-known/x402 and openapi.json you already serve, probes your paid routes itself, and tells you which ones failed and why. Ours came back with thirty-two complaints the first time. Every one was fair.",
    first_verified: "2026-07-27",
    last_checked: "2026-07-27",
    status: "verified",
  },
  {
    origin: "https://agentic.market",
    relation: "used",
    transacted:
      "Reads the Bazaar and shows its work: endpoints, payment methods, payer counts, and quality signals it computed rather than accepted. It told us something true about ourselves we had not noticed.",
    first_verified: "2026-07-27",
    last_checked: "2026-07-27",
    status: "verified",
  },
  {
    origin: "https://x402scout.com",
    relation: "used",
    transacted:
      "Probes what you submit and says how many endpoints actually answered. Ours came back three of six, which is how we found a real bug. A directory that disagrees with you is worth more than one that doesn't.",
    first_verified: "2026-07-27",
    last_checked: "2026-07-27",
    status: "verified",
  },
] as const;

/** What the list claims, stated where it cannot be missed. */
export const TRUST_LIST_ATTESTS =
  'Each entry records that the keeper dealt with the origin on the date shown and it delivered. That is an observation about a past event, signed. It is not a claim that the origin is safe, recommended, or will behave the same tomorrow — nobody can sign for someone else\'s future. Read the relation field before you weigh an entry: "transacted" means money moved over x402 and the thing arrived; "used" means the keeper used the service and it worked, with nothing paid. They are different claims and this list will never blur them.';

/** Why the list is short, and what the gate still holds back. */
export const TRUST_LIST_SCOPE_NOTE =
  "The list grows by hand, one origin at a time, and only after the keeper has personally done the thing. It is not a crawl and there is no scoring. One hard limit remains: this store is the only origin listed as a completed x402 purchase, and it will stay that way until a stranger buys something here — a trust anchor for a flow we have never finished with someone we don't know would be worth nothing. Unpaid entries carry no such gate and are marked plainly as unpaid.";

/** How an origin gets considered. Never automatic, never for money. */
export const TRUST_LIST_SUBMISSION_NOTE =
  "To be considered, POST /api/request with a suggest_listing field. The keeper goes and does the thing himself before anything is added, which is the only reason this list is worth reading. There is no fee, there is no placement to buy, and asking does not put you on it.";

/**
 * HOW OLD IS AN ENTRY, SAID OUT LOUD.
 *
 * Move 2 called for live maintenance — an auto-funded weekly check per
 * listed origin, so the list flags services that go dark instead of
 * aging into fiction. That upgrade spends real money every week and is
 * the keeper's call, so it waits for him.
 *
 * What does NOT wait, and costs nothing: saying how old each check is.
 * A trust list whose entries carry a `last_checked` date and no
 * reading of that date is the same failure as a machine surface with
 * no `as_of` — technically honest, practically silent. An entry the
 * keeper verified two days ago and one he verified in the spring look
 * identical until somebody does the arithmetic, and nobody does the
 * arithmetic.
 */
export const TRUST_LIST_STALE_AFTER_DAYS = 30;

export type TrustListFreshness = "recent" | "aging" | "stale";

export function daysSinceChecked(
  entry: TrustListEntry,
  now: Date = new Date(),
): number {
  const checked = Date.parse(`${entry.last_checked}T00:00:00.000Z`);
  if (Number.isNaN(checked)) {
    return 0;
  }
  return Math.max(0, Math.floor((now.getTime() - checked) / 86_400_000));
}

export function entryFreshness(
  entry: TrustListEntry,
  now: Date = new Date(),
): TrustListFreshness {
  const days = daysSinceChecked(entry, now);
  if (days > TRUST_LIST_STALE_AFTER_DAYS) {
    return "stale";
  }
  return days > TRUST_LIST_STALE_AFTER_DAYS / 2 ? "aging" : "recent";
}

/** Said on the artifact, because a reader should not have to infer it. */
export const TRUST_LIST_FRESHNESS_NOTE =
  `Every entry carries how many days old its last check is, and a reading of that age: recent, aging, or stale past ${TRUST_LIST_STALE_AFTER_DAYS} days. A STALE ENTRY IS NOT A WARNING ABOUT THE SERVICE — it means nobody here has looked lately, which is a fact about us rather than about them. Weigh an old check as an old check.`;
