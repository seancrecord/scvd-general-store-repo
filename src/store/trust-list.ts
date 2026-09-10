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
 * the entry roster still needs its own observed delivery evidence.
 * Correction 2026-09-06: this old gate rationale is not a current sales
 * count. Later sale records live in the books; they do not automatically
 * add a transacted entry to this hand-maintained list.
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
 * strong claim and the weak one, never collapsed into each other —
 * and, since v2, a third relation that is neither: a treaty.
 */
export type TrustListRelation = "transacted" | "used" | "treaty";

interface TrustListEntryBase {
  /** The origin checked. Not a deep link; the thing that either exists or doesn't. */
  origin: string;
  /** ISO date the keeper first verified it by doing the thing. */
  first_verified: string;
  /** ISO date of the most recent check. */
  last_checked: string;
  status: TrustListStatus;
}

/** An origin the keeper dealt with: money moved, or he used it unpaid. */
export interface TrustListDealing extends TrustListEntryBase {
  /** Paid transaction, or unpaid use. The reader decides what that's worth. */
  relation: "transacted" | "used";
  /** What was transacted, in general terms. Never private detail. */
  transacted: string;
}

/**
 * THE TREATY RELATION, v2 — added 2026-09-10, the day the first yes
 * arrived (StillOS Notary, issue #622 on the public repository,
 * answering docs/RECEIPT_TREATY_ASK.md from the other direction).
 *
 * A treaty is two operators each stating, publicly and revocably,
 * that artifacts signed by the other's published key are honoured as
 * evidence of exactly what they attest — nothing more. It is a
 * DIFFERENT claim from the two above: nothing was bought and nothing
 * was used. What the keeper "did" is read their statement at a URL
 * they control, and this entry points at that URL. It never
 * paraphrases their words, because a list that restates someone
 * else's promise in its own voice is a list that can drift from it.
 * Revocable by either side unpublishing: the statement is re-read,
 * never cached as a promise, and `last_checked` says when.
 *
 * The roster is EMPTY UNTIL THE KEEPER HAS READ THE STATEMENT. The
 * first yes was reported in words this build environment could not
 * check (its egress refused the host), and an entry for a URL nobody
 * here has opened would be the same wishful thinking counterparts.ts
 * refuses. The entry lands by his hand, dated the day he read it.
 */
export interface TrustListTreaty extends TrustListEntryBase {
  relation: "treaty";
  /** THEIR statement, at a URL they control. The list points; it does not quote. */
  statement_url: string;
  /** Where THEIR signed artifacts verify, so the treaty runs both ways. Null until they publish one. */
  verify_url: string | null;
  /** Where THEIR public key lives. Null until they publish one. */
  key_url: string | null;
}

export type TrustListEntry = TrustListDealing | TrustListTreaty;

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
    last_checked: "2026-08-21",
    status: "verified",
  },
  {
    origin: "https://www.x402scan.com",
    relation: "used",
    transacted:
      "Reads the /.well-known/x402 and openapi.json you already serve, probes your paid routes itself, and tells you which ones failed and why. Ours came back with thirty-two complaints the first time. Every one was fair.",
    first_verified: "2026-07-27",
    last_checked: "2026-08-21",
    status: "verified",
  },
  {
    origin: "https://agentic.market",
    relation: "used",
    transacted:
      "Reads the Bazaar and shows its work: endpoints, payment methods, payer counts, and quality signals it computed rather than accepted. It told us something true about ourselves we had not noticed.",
    first_verified: "2026-07-27",
    last_checked: "2026-08-21",
    status: "verified",
  },
  {
    origin: "https://x402scout.com",
    relation: "used",
    transacted:
      "Probes what you submit and says how many endpoints actually answered. Ours came back three of six, which is how we found a real bug. A directory that disagrees with you is worth more than one that doesn't.",
    first_verified: "2026-07-27",
    last_checked: "2026-08-21",
    status: "verified",
  },
] as const;

/** What the list claims, stated where it cannot be missed. */
export const TRUST_LIST_ATTESTS =
  'Each entry records that the keeper dealt with the origin on the date shown and it delivered — or, for a treaty, that he read the statement it published that day. That is an observation about a past event, signed. It is not a claim that the origin is safe, recommended, or will behave the same tomorrow — nobody can sign for someone else\'s future. Read the relation field before you weigh an entry: "transacted" means money moved over x402 and the thing arrived; "used" means the keeper used the service and it worked, with nothing paid; "treaty" means the origin published, at a URL it controls, that it honours artifacts signed by this store\'s key as evidence of what they attest, and this store honours theirs the same way. They are different claims and this list will never blur them.';

/**
 * WHAT A TREATY ENTRY COMMITS EACH SIDE TO, stated once on the list
 * rather than once per entry, so the terms cannot vary by row. The
 * wording is the ask's own (docs/RECEIPT_TREATY_ASK.md), and the
 * negative half is the load-bearing part.
 */
export const TRUST_LIST_TREATY_TERMS =
  "A treaty entry means both sides have stated, publicly and revocably, that an artifact signed by the other's published key, when presented and verified, is treated as evidence of exactly what it attests — its own signature_covers scope and its own what-this-does-not-prove text — and nothing more. It is not an endorsement of the other operator's judgment, not liability for their mistakes, not an uptime dependency, and not exclusive. Either side revokes by unpublishing; the entry points at their statement rather than quoting it, and last_checked is the day it was last re-read.";

/** Why the list is short, and what the gate still holds back. */
/**
 * THE GATE, RULED ON 2026-07-29 AND WHY IT HELD.
 *
 * The question: we had by then completed a paid x402 flow with a
 * stranger — as the BUYER, paying 402sentinel — so did the gate's
 * stated reason ("we cannot be the trust anchor for a flow we have
 * never completed with a stranger") let us list a paid entry?
 *
 * RULING: NO. The gate holds. CV argued it and the argument is better
 * than the question was, so it is recorded rather than summarised:
 *
 *   The sentence is only loose in isolation. Where it actually sits,
 *   the very next clause defines its own referent — "this store
 *   remains the only origin listed as a completed x402 purchase until
 *   a stranger buys something." A flow with a stranger means a
 *   stranger buying from US.
 *
 *   And the logic only works pointed one way. The gate is not asking
 *   whether we have ever transacted with an unfamiliar counterparty —
 *   we clear that bar constantly, and if it counted the gate would
 *   have opened on day one and never functioned as a gate. It asks
 *   something narrower and harder: has this store's own SELL-SIDE
 *   flow ever been trusted with real money by somebody who owes us
 *   nothing? That is the only evidence that our signature on someone
 *   else's trustworthiness means anything. Us buying from a competitor
 *   is good due diligence. It is not standing to vouch.
 *
 *   There is also a claim-chain risk of exactly the auto-refund shape:
 *   `transacted` reads, BY CATEGORY, as "the sell-side gate cleared"
 *   even when it did not. Technically defensible, misleading by
 *   proximity — which is the class of thing the claim-chain test
 *   exists to catch before it ships rather than after.
 *
 * The 402sentinel purchase stays where it belongs, on /neighbours as a
 * receipt. It is not promoted into this list.
 */
export const TRUST_LIST_SCOPE_NOTE =
  "The list grows by hand, one origin at a time, and only after the keeper has personally done the thing. It is not a crawl and there is no scoring. The sell-side gate was ruled on 2026-07-29; this list does not report whether that sales milestone has since been met. Each paid entry still needs its own dated delivery evidence and the keeper's decision. Sales elsewhere in the books do not automatically add an origin here. Unpaid entries are marked plainly as unpaid.";

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
  entry: Pick<TrustListEntry, "last_checked">,
  now: Date = new Date(),
): number {
  const checked = Date.parse(`${entry.last_checked}T00:00:00.000Z`);
  if (Number.isNaN(checked)) {
    return 0;
  }
  return Math.max(0, Math.floor((now.getTime() - checked) / 86_400_000));
}

export function entryFreshness(
  entry: Pick<TrustListEntry, "last_checked">,
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
