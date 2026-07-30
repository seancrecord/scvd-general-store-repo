/**
 * WHAT THIS STORE IS TRYING TO PROVE, AND WHAT IT IS WATCHING FOR.
 *
 * The quarantine /what promised. That page now ends its inventory with
 * "all of that is running now; none of it is a roadmap," which is only
 * true if the roadmap lives somewhere a reader can tell apart at a
 * glance. This is that somewhere.
 *
 * ONE RULE GOVERNS THE WHOLE PAGE: nothing here is a capability claim.
 * Every entry is either a thesis with a way to prove it wrong, or a
 * decision waiting on a trigger that has not fired. An evaluator who
 * reads a vision statement, checks, and finds it unbuilt discounts the
 * true parts along with the false ones — so the split is structural
 * rather than a disclaimer at the top.
 *
 * TRIGGERS, NOT DATES. A date is a promise about a calendar; a trigger
 * is a fact about the world, and one of them can be checked by
 * somebody who does not work here. The Solana decision was already
 * written this way before this page existed; the page generalises it.
 *
 * ⚑ THE THESES ARE THE KEEPER'S, VERBATIM. He answered four questions
 * in his own words and they are reproduced as he wrote them. What is
 * NOT his is the falsifier attached to each — that is the mechanism
 * this store applies to everything else, and it is open to his pen.
 */

export interface Thesis {
  /** The keeper's words. Not paraphrased. */
  claim: string;
  /** What would show it false. The half that makes it a claim. */
  falsified_by: string;
}

export const THESES: readonly Thesis[] = [
  {
    claim:
      "Honesty is a viable commercial strategy in a market being born.",
    falsified_by:
      "Not by zero revenue, which is a fact about reach. By a stretch where the store is found, read, and understood, and agents route around it to somebody vaguer — the same buyers, offered a checkable claim and an unchecked one, choosing the unchecked one on purpose.",
  },
  {
    claim: "The human-AI partnership is real and not a gimmick.",
    falsified_by:
      "The day the AI half could be swapped for a template without anyone noticing, or the human half for a script. If the counter's judgement never changes an outcome and the keeper's hand never touches a thing that ships, the partnership was set dressing and the store should say so.",
  },
  {
    claim: "That my way of moving through the world works.",
    falsified_by:
      "Only by the keeper, and only honestly. This is the one thesis on the page whose test is not a metric, and pretending otherwise would be its own kind of faking.",
  },
  {
    claim: "That presence deserves a record.",
    falsified_by:
      "If the records go unread and unchecked — no verifies, nobody re-reading an anchor, no visitor ever returning to a stamp — then the record was for us and not for anyone. /pulse counts re-verifications for exactly this reason.",
  },
];

export interface Settled {
  question: string;
  answer: string;
  because: string;
}

/**
 * THE DECISIONS THAT ARE MADE, so nobody has to keep asking. Two of
 * these were live strategic questions this week; both are closed.
 */
export const SETTLED: readonly Settled[] = [
  {
    question: "Will this become infrastructure other services build on?",
    answer: "No. It stays a shop.",
    because:
      "The store will not limit itself, but infrastructure properly defined means other people's uptime depends on one keeper — which hands strangers a pager pointed at a man with a day job and a family. That is an architectural objection, not a modest one. A shop sells you a thing; you leave with it; the transaction is complete. This is why /attestation says THIS IS A SHOP, NOT INFRASTRUCTURE and will keep saying it.",
  },
  {
    question: "Does the town survive getting bigger?",
    answer: "Towns don't scale. They persist.",
    because:
      "The porch, the train, the gazette and the almanac are not a launch aesthetic to be shed at volume, and they are not a growth mechanism either. They are the shape of the place. A reader who files this store as retail because it looks like a store has read it correctly.",
  },
  {
    question: "What would make the keeper stop?",
    answer:
      "The store stops when keeping it would require faking something — faking enthusiasm, or faking the books.",
    because:
      "Zero revenue forever is not on the list. A truthful institution with no customers is a hobby with a ledger, and the man keeps hobbies for decades. The two named fakes are the general form of the two standing house rules against engagement mechanics and against wash trading; those rules are instances, this is the principle underneath them.",
  },
];

export interface Watched {
  /** The thing that is not being built yet. */
  item: string;
  /** The fact that would change the answer. Never a date. */
  trigger: string;
  /** What exists toward it today, honestly. Often nothing. */
  today: string;
}

export const WATCHED: readonly Watched[] = [
  {
    item: "A second chain (Solana).",
    trigger:
      "One request through the window asking for it, or one signature presented for a non-EVM network. Either is a fact; neither has happened.",
    today:
      "Nothing. Base only, one facilitator, one asset config. Recorded honestly: a Solana-only agent that reads our 402, sees eip155:8453 and leaves is INVISIBLE to us — no decline, no reason code — so 'no evidence of demand' is a weaker statement than it sounds, and it is written down as weaker.",
  },
  {
    item: "Key succession — a pre-announced, pre-signed successor key.",
    trigger:
      "This one is already overdue rather than waiting: /wind-down states that a retired key never re-signs or revokes an old signature, which is a commitment about a scheme that does not exist yet.",
    today:
      "One ed25519 key, no rotation, no recovery, listed under what this store does not have at /attestation. The design question that gates it is not cryptographic — it is where a successor private key physically lives, because a successor stored beside the primary is a second way to become us for no benefit.",
  },
  {
    item: "Receipt treaties — another small shop honouring artifacts issued here.",
    trigger:
      "One other operator saying yes. The gate is not technical and never was.",
    today:
      "Nothing bilateral exists. /trust-list.json is version 0 and lists only this store; /neighbours lists services we have paid, which is a different relation entirely.",
  },
  {
    item: "Federation — somebody else adopting the format unprompted.",
    trigger:
      "The first time an operator we did not ask adopts the receipt format, vouches for us unprompted, or forks the pattern. Observable in our own logs, which is why it is on this list rather than in a wish.",
    today:
      "Has not happened. Recorded here so that if it does, it is a fact we were already watching for rather than one we noticed afterwards and called a milestone.",
  },
];

export const BECOMING_STANDFIRST =
  "What this store is trying to prove, what it has already decided, and what it is watching for. Kept apart from everything else deliberately: /what lists only what is running today, and this page holds the part that is not built. Nothing here is a capability — every entry is either a claim with a way to show it false, or a decision waiting on a trigger that has not fired.";

export const BECOMING_LIMIT =
  "NOTHING ON THIS PAGE IS AVAILABLE. If you are deciding whether to buy something, the page you want is /what, which lists only what is running now, or /menu.json, which is the shelf. This one exists so that the difference between those two things and this one is never left to a reader to work out — a store whose plans and whose inventory read with the same weight is asking to have both discounted at once.";

/** The day the theses were written down. */
export const BECOMING_DATED = "2026-07-30";
