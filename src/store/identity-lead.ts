import { MENU_ITEMS } from "@/store/menu";
import { NEVER_A_RANKING_SENTENCE } from "@/store/copy/doctrine";

/**
 * WHAT THIS STORE SAYS IT IS, IN ONE PLACE, FOR EVERY MACHINE READER.
 *
 * ROADMAP 0.10, keeper's canon 2026-08-24. Six agent-facing surfaces
 * each opened with their own paragraph, and `llms.txt` led with
 * "Sean-Claude Van Damme's General Store" — a name that tells an agent
 * deciding where to route a conformance check absolutely nothing about
 * x402. The voice was never wrong. It was in the wrong POSITION for a
 * reader that stops at the first line.
 *
 * ONE CONSTANT, NOT SIX PARAGRAPHS. Six copies of an identity is six
 * things to update and five chances to drift, which is AT_SCALE rule
 * 1 in its most expensive form: the drift would be in the sentence
 * that says what we are. The ordering canary in
 * test/identity-lead.spec.ts asserts the observatory line precedes
 * the store line on every surface, so a future edit that buries the
 * identity again fails by name.
 *
 * THE SHAPE IS DELIBERATE, and it is the store's own doctrine turned
 * on its own marketing: the claim comes first, the REFUSALS come
 * second, and the free instruments come before the paid ones. A
 * reader who stops after two sentences has learned what we are and
 * what we will not do — which is more useful than learning what we
 * sell.
 */

/** The real floor, derived. "Half a cent" was three files' worth of stale. */
export function cheapestUsdc(): number {
  return MENU_ITEMS.reduce(
    (low, item) => (item.price_usdc < low ? item.price_usdc : low),
    Number.POSITIVE_INFINITY,
  );
}

/** Formatted for prose: $0.004, not $0.00. */
export function cheapestLabel(): string {
  const usd = cheapestUsdc();
  return `$${usd.toFixed(usd < 0.01 ? 3 : 2)}`;
}

/** The H1 / title form. Machines read this first; keep it a name. */
export const IDENTITY_TITLE =
  "scvd.store — evidence observatory for the x402 economy";

/** Short form, for anywhere the full title would read as shouting. */
export const IDENTITY_SHORT = "scvd.store";

/**
 * THE IDENTITY AT A REGISTRY'S BUDGET (2026-09-15, the keeper's call).
 *
 * A fifth length, for the same reason there are already four: the
 * budget is real and it is not any of the others. `metaDescription`
 * is ~160 characters for a search snippet; the canon in metadata.ts
 * is 900-odd characters written for a reader that fetches the whole
 * document. An ERC-721 or ERC-8004 registry is neither. It renders
 * the description on a card beside the name and the image, collapses
 * it after two or three lines, and the reader deciding whether to
 * look further never expands it. Handed the canon, an explorer shows
 * a paragraph cut mid-clause; handed the meta description, it shows
 * a search snippet with no price and no shelf.
 *
 * THE BUDGET, and why this shape. Roughly 400 characters against the
 * canon's 900 — better than half off, and the test below pins the
 * ceiling so it cannot drift back. The first 120 survive even the
 * tightest card, so they carry the identity and nothing else: the
 * same three words the canon opens with, in the order the canary
 * enforces — observatory first, shop second. Then the free
 * instruments, then the REFUSAL, then the shop and the rail, which is
 * the doctrine's own order. The refusal is a fifth of the budget and
 * keeps it anyway: "never a ranking" is the sentence that separates
 * this store from every scoring product a registry will file it
 * beside. The price floor is last because it is the most persuasive
 * number this store has and the last thing a skimmer carries away —
 * the same reasoning that put it at the end of the Organization
 * description.
 *
 * NOT A NEW CLAIM ANYWHERE IN IT. Every clause is a shorter saying of
 * something already published at length; a registry card is the worst
 * possible place to introduce a fact no other surface carries.
 *
 * DERIVED, NOT TYPED. The floor comes from the shelf. Three files once
 * said "half a cent" while the cheapest door was $0.004, and this
 * string travels further than any of them: an explorer caches it and
 * it becomes the store's identity in somebody else's index, where a
 * stale price cannot be corrected by us.
 */
export function registryDescription(): string {
  return `An evidence observatory for agentic commerce: independent signed observation of x402 endpoints, payments and receipts. Preflight a door before paying and check any issuer's signed receipt after — both free. ${NEVER_A_RANKING_SENTENCE} Also a general store for agents, paid in USDC over x402 from ${cheapestLabel()}. Every artifact verifies offline, free, forever.`;
}

/** The lead. Reused verbatim; never re-typed per surface. */
export function identityLead(): string {
  return `scvd.store is an evidence observatory for agentic commerce — x402 today, cross-protocol by design. It observes what other people's endpoints, artifacts and payments actually did, signs every observation, and publishes the gaps in its own coverage beside the findings, counted against itself. ${NEVER_A_RANKING_SENTENCE} Every verdict is one dated observation that expires and is re-taken, or a derivation from those observations that prints its rule and its fraction — verifiable offline by anyone, without asking us. Free instruments: a preflight check on any x402 door, a conformance desk for any issuer's signed offers and receipts — including our competitors' — a named defect vocabulary, and a Bitcoin-anchored history that appends daily. Paid instruments: conformance audits, endpoint watches, settlement attestations, launch checks.`;
}

/** The store, second, intact. */
export function storeLead(): string {
  return `It is also a general store for autonomous agents, kept by a named human, paid in USDC over x402 v2 on a network offered in the current quote. The cheapest thing on the shelf is ${cheapestLabel()}.`;
}

/** Both paragraphs, in the order the canary enforces. */
export function identityBlock(): string {
  return `${identityLead()}\n\n${storeLead()}`;
}

/**
 * The two markers the ordering canary looks for. Substrings rather
 * than whole sentences, so rewording the copy does not break the
 * test — only REORDERING it does, which is the thing being guarded.
 */
export const OBSERVATORY_MARKER = "evidence observatory";
/*
 * "general store" rather than the full phrase: skill.md says "general
 * store for agents", llms.txt says "for autonomous agents". Pinning
 * the longer string would make this canary a copy-editing test, and a
 * canary that fires on wording is one that gets silenced. The short
 * form is unambiguous on these surfaces and still moves when the
 * SECTION moves, which is the thing under guard.
 */
export const STORE_MARKER = "general store";
