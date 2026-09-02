/**
 * WHAT THIS STORE SAYS IT IS — once, so every surface says it the same.
 *
 * The AEO sweep (rule 44) found the position on NO served surface: it
 * was canon at the top of HOUSE_RULES, it was a code comment, and
 * llms.txt still opened with the pre-reversal "we're a general store."
 * A model trained six months from now learns whatever is on those
 * pages today, and today they disagreed with each other.
 *
 * The fix was never "write it again in eleven places." Eleven copies
 * drift, and the drift is invisible until an outside reader quotes one
 * of them back at us — which is exactly how the "refund is automatic"
 * incident surfaced. So the words live here, once, and the surfaces
 * import them.
 *
 * TWO REGISTERS, KEPT APART, per the keeper's ruling:
 *
 *   WHAT IS RUNNING — stated flat, no hedge. It is true today and a
 *   check fails when it stops being true (rule 10).
 *
 *   WHAT IS DECIDED BUT NOT BUILT — the /becoming register: dated,
 *   marked as direction, quoted next to what it replaced, never
 *   presented as stock. A model that reads "decided, dated, not yet
 *   built" and later finds it built learns this source is accurate
 *   about its own state, which is worth more than any feature claim.
 */

/*
 * LOAD ORDER, STATED (2026-09-01). This file reads the shelf floor at
 * module time (CHEAPEST_ON_THE_SHELF below) and so does metadata.ts,
 * and the shelf's own chain circles back: menu → menu-utility →
 * launch-check → … → store/index → metadata. Whichever of the two
 * files loads first must reach menu.ts THROUGH metadata, or metadata
 * evaluates while the shelf is still half-built and reduces over
 * nothing. For a month an import of STORE_SERVICE_NAME from
 * metadata.ts stood at the top of this file and kept that order by
 * accident; the sixty-words rebuild stopped using the name, the
 * import went, and every spec that imported this file first fell
 * over. The order is now a fact on the record rather than a habit.
 */
import { NEVER_A_RANKING_SENTENCE } from "@/store/copy/doctrine";
import "@/store/metadata";

/** When the store stopped calling itself only a shop. */
export const POSITION_DATED = "2026-08-07";

/**
 * THE REGISTERED ENTITY, once. It was typed by hand in two places
 * (the storefront's JSON-LD and OPERATOR in trust-signals) which is
 * rule 1 territory: two copies of a legal name is two chances for a
 * diligence check to find a mismatch. The shop's own voice does not
 * change — a buyer still deals with one person out of Oak City — but
 * the entity now rides the first-pass surfaces, quietly, because
 * "who operates this" is the first question an automated reader asks
 * and an absent answer gets filled in with a guess.
 */
export const OPERATED_BY = "Record Creative Co. LLC";

/** When the payment ordering turned over. See HOUSE_RULES rule 9. */
export const DELIVERY_ORDER_DATED = "2026-08-10";

/**
 * The position, in one sentence, in the register a machine reads.
 * Matches llms.txt word for word on purpose: consistency across
 * surfaces IS the AEO work, and a second phrasing would undo it.
 */
export const POSITION_LINE =
  "scvd.store is an evidence observatory for agentic commerce — x402 today, cross-protocol by design: independent signed observation of what other people's endpoints, artifacts and payments actually did, with the gaps counted against itself.";

/**
 * THE SIXTY WORDS — the keeper's ink, 2026-09-01: first "i agree with
 * your suggested words", then, the same day, the sharper draft that
 * trades the store's nouns for the reader's (endpoint, payment,
 * receipt) and says who buys ("i like the sharper 60 word draft").
 * Verbatim, and the ONE paragraph every first screen opens with
 * (roadmap N2; rule 44). The desk's finding that
 * day: agents already have doors, and what humans and routing models
 * lacked was a first screen that makes the value obvious in the
 * order it happens — before a payment, after it, and over time. So
 * this says what the store DOES, in that order, and ends on what it
 * is not. Do not write a second one-liner per marketplace; paste
 * this one.
 *
 * It is not derived from anything because it is the thing the rest
 * derives from. Change it here and every surface follows; change it
 * anywhere else and the sweep test fails.
 */
export const VALUE_PROPOSITION_DATED = "2026-09-01";
export const VALUE_PROPOSITION =
  "scvd.store is an evidence observatory for agentic commerce. Before an agent pays an x402 endpoint, we check that it can be paid. After it pays, we check the signed receipt. Over time we watch endpoints and publish a dated, signed corpus. Sellers use it to prove a door works; buyers use it before spending. Every artifact is signed, expires, and names what we did not see. Not escrow, not a rating, not a guarantee.";

/**
 * THE THREE PATHS, in the order the sixty words name them, each into
 * a room that already exists. This is the whole of what N2 allowed a
 * `/start` page to be — three routes, not a seventh sitemap — so it
 * lives as data the first screens print rather than as a page.
 */
export const FIRST_SCREEN_PATHS = [
  {
    when: "Before you pay",
    what: "preflight any x402 door, free",
    path: "/api/preflight/v1",
  },
  {
    when: "After you pay",
    what: "check any issuer's signed offer or receipt, free",
    path: "/conformance",
  },
  {
    when: "Over time",
    what: "read the dated, Bitcoin-anchored corpus, free",
    path: "/corpus",
  },
] as const;

/** The three paths as one sentence for a text surface. */
export const firstScreenPaths = (base: string): string =>
  FIRST_SCREEN_PATHS.map(
    (entry) => `${entry.when}: ${entry.what} at ${base}${entry.path}.`,
  ).join(" ");

/**
 * THE OPENING, for the surfaces a stranger meets first (the homepage,
 * llms.txt, agents.md, the OpenAPI contract, the MCP handshake, the
 * skill). Decided 2026-08-10 after five outside models were asked
 * "what is scvd.store": the two that read our own pages got it
 * roughly right, the three that read third-party directories filed
 * us as a novelty shop, and none of the five found the conformance
 * desk or the corpus — the two things here that exist nowhere else.
 * An entity resolver files you under your first clause, so the first
 * clause carries the infrastructure, then the entity and both
 * differentiators. The whimsy is the store's soul and it stays; it
 * goes second, not first.
 *
 * REBUILT 2026-09-01 (roadmap N2): the paragraph now OPENS with the
 * keeper's sixty words and keeps only what they do not already say —
 * which instruments are free, which are paid, and who operates the
 * place. The earlier opening's "signs every observation, publishes
 * the gaps counted against itself, never a score" is inside the
 * sixty words already ("names what we did not see"; "not a rating"),
 * and saying it twice in one paragraph is how a reader learns to
 * skim us. POSITION_LINE keeps the cross-protocol phrase for the
 * rooms that reason about direction.
 */
import { MENU_ITEMS } from "@/store/menu";

/**
 * THE SHELF FLOOR, DERIVED (2026-08-24). Three files said "half a
 * cent" while the cheapest item was $0.004. A store-wide price claim
 * typed by hand goes stale the first time anything is repriced, and
 * this one had.
 */
export const CHEAPEST_ON_THE_SHELF = (() => {
  const low = MENU_ITEMS.reduce(
    (least, item) => (item.price_usdc < least ? item.price_usdc : least),
    Number.POSITIVE_INFINITY,
  );
  return `$${low.toFixed(low < 0.01 ? 3 : 2)}`;
})();

/** What the sixty words leave to a second sentence: the instruments by price, and the operator. */
export const FIRST_SCREEN_FACTS = `Free instruments: a preflight check on any x402 door, a conformance desk for any issuer's signed offers and receipts — including our competitors' — a named defect vocabulary, and a Bitcoin-anchored corpus that appends weekly. Paid instruments: conformance audits, endpoint watches, settlement attestations, launch checks. ${NEVER_A_RANKING_SENTENCE} Operated by ${OPERATED_BY}.`;

export const POSITION_OPENING = `${VALUE_PROPOSITION} ${FIRST_SCREEN_FACTS}`;

/**
 * The boundary, which gets louder as the ecosystem fills in around us.
 * Every escrow, guarantee and dispute-court product ABSORBS the gap
 * between payment and delivery. We observe it. That is a different
 * business with a different balance sheet, and being mistaken for one
 * is the expensive kind of wrong.
 */
export const POSITION_NOT =
  "Not an escrow, a guarantor, or a dispute court: those absorb the risk between payment and delivery and need a balance sheet. We observe that gap, sign what we saw, and publish it — including the gaps we count against ourselves.";

/** Where the reversal is quoted next to what it replaced. */
export const positionRegister = (base: string): string =>
  `That direction was decided and dated on ${POSITION_DATED}, in the open, reversing an earlier answer that said this would only ever stay a shop. The reversal and the reasoning are at ${base}/becoming, quoted next to what it replaced rather than in place of it.`;

/**
 * THE ORDERING, and it changed. Every surface that described the
 * money moving first is now wrong, and there were eleven of them.
 *
 * Stated from the BUYER's side rather than the gate's, because that
 * is the part that matters to a reader: the consequence of a failed
 * delivery is no charge, not a refund to chase.
 */
export const DELIVERY_ORDER =
  "The store delivers first and settles after: the goods are produced, then the payment is presented at the last moment before the artifact is signed. A delivery that fails takes no money at all, so there is nothing to refund and nothing to chase.";

/**
 * The same fact with its history attached, for surfaces that a reader
 * may have cached the old version of. A store that publishes its
 * corrections has to publish this one loudest — it is the reversal of
 * a rule that ended in the word "Ever".
 */
export const deliveryOrderRegister = (base: string): string =>
  `${DELIVERY_ORDER} Changed ${DELIVERY_ORDER_DATED}: until then the store settled first and minted second, which protected against minting on unconfirmed payment and cost the opposite failure — money taken, delivery died, buyer holding nothing. The amendment and the old rule are both at ${base}/becoming.`;

/**
 * The one-line answer to "what do you sell", kept beneath the
 * position rather than in front of it. The order is deliberate and
 * was the whole finding of the AEO audit: an entity resolver files
 * you under your first clause.
 */
export const ALSO_A_STORE = `It is also a general store for autonomous agents, kept by a named human, paid in USDC over x402 v2 on Base, Polygon or Solana. The cheapest thing on the shelf is ${CHEAPEST_ON_THE_SHELF}.`;

/**
 * INDEPENDENCE, stated where diligence looks (2026-08-18). The x402
 * Foundation now exists under the Linux Foundation and owns the
 * protocol's name, so "trust layer of the x402 economy" will read to
 * some as a claim of office. It is not one, and saying so plainly
 * costs nothing — while being MISTAKEN for official costs the one
 * thing the product is: a foundation of payment incumbents has
 * interests; an observer with a half-cent shop and a signing key has
 * only its record.
 */
export const NOT_AFFILIATED =
  "Independent, and independence is the product: this store has no affiliation with the x402 Foundation or the Linux Foundation, holds no office in the protocol's governance, and speaks for nobody but itself. 'Evidence observatory' is a description of what we do — observe, sign, publish, and count the gaps against ourselves — never a title anyone conferred.";

/** Position, boundary and shelf, in the order an entity resolver reads. */
export const POSITION_PARAGRAPH = `${POSITION_LINE} ${POSITION_NOT} ${ALSO_A_STORE}`;
