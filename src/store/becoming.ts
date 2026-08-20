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
    /**
     * REVERSED 2026-08-07, by the keeper, in the open. The original
     * answer — "No. It stays a shop." — stood from 2026-07-30 and is
     * quoted here rather than deleted, because a page that quietly
     * rewrites its settled answers is worth nothing as a record. The
     * reasoning trail is in the repository (MARKETPLACE_AUDIT.md),
     * and the objection the old answer rested on is answered below
     * rather than waved past.
     */
    answer:
      "Answered 'No, it stays a shop' on 2026-07-30. Reversed by the keeper on 2026-08-07: the store is evolving toward the trust layer of the x402 economy, deliberately and on the record.",
    because:
      "The old answer's objection was architectural and it was real: infrastructure means other people's uptime depending on one keeper, a pager pointed at a man with a day job and a family. What changed is evidence, not appetite — the till has settled organic purchases across two payment rails, the technology this store rides is maturing under it, and the gates open so the store can provide what the agents it serves actually need. The objection is answered, not dismissed: every standing obligation stays bounded, prepaid, and gap-published in the Night Watch shape (an end date, renewed only by the buyer, our missed passes in the book); degradation stays graceful and published; and the succession work sits on this page's own watched list with its trigger. A reader who held the old answer against us is invited to: that is what this page is for.",
  },
  {
    question: "Does the town survive getting bigger?",
    answer: "Towns don't scale. They persist.",
    because:
      "The porch, the train, the gazette and the almanac are not a launch aesthetic to be shed at volume, and they are not a growth mechanism either. They are the shape of the place. A reader who files this store as retail because it looks like a store has read it correctly.",
  },
  {
    question: "Is there a line the store will not cross to grow?",
    answer:
      "The store never reaches into the relationship between an agent and its human.",
    because:
      "That relationship is the one thing here that belongs to somebody else, and every mechanism a growing store is tempted by reaches straight into it: nudges aimed past the operator, streaks that make skipping a week cost something, content written to be forwarded rather than read, a buyer's own words treated as instructions. This store already refuses those one at a time — nothing agent-written is ever read as an instruction, /what exists so the human can check on the agent rather than the reverse, and the clock is published so a schedule can be planned around instead of pulled back to. This is the sentence under all of it.",
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
    item: "Key succession — a pre-announced, pre-signed successor key.",
    trigger:
      "A place to keep a second private key that is not beside the first one. That is the whole gate, and it is a physical question rather than a cryptographic one: a successor stored next to the primary is a second way to become us in exchange for nothing.",
    today:
      "The MECHANISM shipped and was used the same day, which is not the same as the item being done. 2026-07-31: the protocol published in the morning, and by afternoon the store had performed a real handover under it — because writing the paper-backup ceremony turned up the fact that no recoverable copy of the first private key existed. Announced before the new key signed anything, the announcement signed by the outgoing key at /api/verify/handover_1, the retired key published forever with its dates. Not a drill and not described as one; it is on /corrections. WHAT IS STILL UNBUILT IS THE THING THIS ENTRY IS ABOUT: a successor to the key now in service, generated and announced BEFORE it is needed, so a future handover does not depend on the outgoing key still being able to sign. Today's worked precisely because the old key was lost as a copy and not as a key. The next one might not be that lucky, and the protocol says out loud that it does not cover that case.",
  },
  {
    item: "Receipt treaties — another small shop honouring artifacts issued here.",
    trigger:
      "One other operator saying yes. The gate is not technical and never was.",
    today:
      "Nothing bilateral exists, still. /trust-list.json (version 1) carries this store's own one-way attestations about services it paid or used, freshness-dated — a different relation entirely from a treaty, and saying 'version 0, self-only' here after v1 shipped was this page's staleness defect again, fixed 2026-08-20. What now exists toward the ask itself: the treaty note is drafted (docs/RECEIPT_TREATY_ASK.md in the public repository), the mechanical shape of a yes is written down, and the send waits on the keeper's hand, where all outward sends live.",
  },
  {
    /**
     * RULED 2026-08-18, the same day the contracts were read. The
     * position doc (docs/ERC8183_EVALUATOR.md) was drafted from the
     * actual ERC8183.sol rather than summaries, and the keeper
     * reviewed and aligned. This entry is that ruling in the register
     * this page exists for: decided direction, dated, gated on
     * triggers a stranger can check — never presented as stock.
     */
    item: "The ERC-8183 evaluator seat — serving as the named third-party evaluator on agentic-commerce jobs whose deliverables this store's published batteries can already judge. The standard's own text gives the seat to one address: an evaluator who alone may mark a job completed, paid a protocol fee on completion. Decided 2026-08-18: this store intends to sit in it, narrowly — only job types with published criteria, every verdict minting a signed artifact citing the criteria version and deliverable hash, refusals as public as completions.",
    trigger:
      "Two gates, both checkable. First, the wallet law's three blanks (hard cap, cap period, ask-first threshold) — the evaluator is an on-chain actor, and this store has never held a transaction-signing key; a dedicated no-custody evaluator wallet gets ruled in the same breath. Second, a completed testnet run: the store standing in the seat for house-created jobs before anyone's real escrow depends on our liveness, because ERC-8183's one-hour post-expiry grace period makes evaluator downtime the provider's problem.",
    today:
      "The read and the position, nothing on chain. Worth recording why the seat fits: the contract pays the evaluator only on COMPLETION — rejecting pays nothing — so every economic force in the standard leans toward approving, and the only counterweight is an evaluator whose record of signing bad news is public and checkable. That record is this store's entire product; the attestation suite pins 'signs the negative as readily as the positive' as a test. The fee skew is stated rather than hidden, and if we enter, evaluation gets priced off-chain both-outcomes-alike, with the on-chain fee incidental.",
  },
  {
    /**
     * RULED 2026-08-19/20, across the Costco reads and the second
     * retirement. The keeper's words: "In all honesty we wanna be
     * Costco for agents" — and the page this direction belongs on is
     * this one, in this register: decided, dated, gated on facts,
     * never presented as stock. ⚑ KEEPER REVIEW — the phrasings are
     * new ink; the direction is his verbatim.
     */
    item: "The membership store — Costco's architecture, translated to agents. Decided 2026-08-19: the long direction is the one the warehouse model proved — membership as the product (the standing relationship, not the per-item markup, carries the business), radical curation over endless shelves (the second retirement was this direction acting, not housekeeping), and house-made equivalents only where equal-or-better at lower cost is provable. The trajectory is Price Club's, deliberately: earn the builders first, dress the membership later.",
    trigger:
      "Pass-holder economics wait on pass-holders. The credit multiplier for recurring patrons — the move that welds the pass to the rebate — ships when enough standing passes exist that a multiplier changes an agent's decision rather than a spreadsheet cell. Countable in our own books, never a date.",
    today:
      "The rungs that exist are live and run separately: the renewable patronage pass on the shelf, regulars' credit (5% back, closed-loop, the wallet is the card) at /credit, and the bounty board (mystery shopping, retail's oldest audit, pointed at the one economy that never had it) at /bounties. They are not yet joined, and that is the deliberate part — joining them before the membership means anything would be dressing a warehouse nobody shops at.",
  },
  {
    item: "Federation — somebody else adopting the format unprompted.",
    trigger:
      "The first time an operator we did not ask adopts the receipt format, vouches for us unprompted, or forks the pattern. Observable in our own logs, which is why it is on this list rather than in a wish.",
    today:
      "Has not happened. Recorded here so that if it does, it is a fact we were already watching for rather than one we noticed afterwards and called a milestone.",
  },
];

export interface Graduated {
  /** The thing, as the watched list named it. */
  item: string;
  /** The trigger as originally written. Quoted, not cleaned up. */
  trigger: string;
  /** What actually opened the door — which is not always the trigger. */
  fired: string;
  /** What exists now, with its remaining honest gaps. */
  built: string;
}

/**
 * WATCHED, THEN BUILT. A watch list that deletes its hits reads as a
 * list that never hits — the same reasoning that keeps the reversed
 * answer quoted in SETTLED above. Entries move here whole, original
 * trigger included, because the most useful fact this section holds
 * is WHETHER THE GATE THAT OPENED WAS THE ONE THE PAGE NAMED. For
 * the first entry it was not, and that is recorded rather than
 * smoothed over.
 *
 * This section found its reason the hard way: the Solana row sat on
 * the watched list saying "Nothing. Base only" for a week after the
 * rail shipped (2026-08-04 → 2026-08-11, caught by an outside read
 * against /stats) — a staleness defect on the one page whose pitch
 * is that nothing on it goes stale. Moving a built item HERE, with
 * the date, is the structural fix; editing "today" in place would
 * just be the same defect waiting to recur.
 */
export const GRADUATED: readonly Graduated[] = [
  {
    item: "The verification marketplace — signed, dated conformance checks and badges on other people's goods, under rule 43.",
    trigger:
      "As written from 2026-07-30: the criteria page — a published, per-class definition of what 'verified' means here — what was checked, when, against which criteria, what it does not prove, and what retires a badge. No badge ships before that page exists, and whether it exists is checkable by anyone.",
    fired:
      "The trigger as written, in two steps — and this record keeps the seam visible. The criteria page went live 2026-08-10 with the retirement ruling recorded (nothing retires a badge; it ages, and re-observation answers whether it still holds). The checks half was already selling by then — signed point-in-time audits and cards on other people's endpoints, each binding its evidence hash into a verifiable certificate — while this row went on saying 'nothing for sale', which was the Solana row's staleness defect repeating on the audits. The badge half completed 2026-08-20.",
    built:
      "Both halves. The checks: purchasable signed observations of other people's endpoints, pages, and key directories, criteria version named on every artifact, the negative signed as readily as the positive. The badge: every purchased endpoint audit now renders an embeddable dated label at its own permanent URL — verdict and date on one line, criteria cited, linking to the signed report anyone verifies without us. It ages, it is never revoked, and it renders whatever the verdict was, because a store that badges only good news is selling endorsements. The honest gap, stated: no outside subject has yet displayed one; that first sighting is federation-shaped and stays watched.",
  },
  {
    item: "A second chain (Solana).",
    trigger:
      "As written here from 2026-07-30: one request through the window asking for it, or one signature presented for a non-EVM network. Either is a fact; neither had happened when the door opened.",
    fired:
      "The trigger as written never fired, and this record does not pretend it did. What opened the door on 2026-08-04 was a gate this page had not named: the door-cost lens. The facilitator's supported-kinds turned up solana-exact riding the store's existing verify and settle path — one accepts entry, zero new buyer-facing branches — and the standing ruling that a cheap enough door does not wait on demand evidence overrode the demand gate, the same way it already had for the cheapest shelf items. The demand question this entry was watching stays honestly unanswered: a Solana-only agent who left before the rail existed was invisible to us, and no request ever came through the window.",
    built:
      "Live since 2026-08-04, flag-gated: Base stays first in every 402 as a compatibility promise, certificates record which rail settled at mint, and the Solana side of the bank reconciliation walks its chain the same day-counted way as Base. Organic settlements have since arrived on the rail; they are counted at /stats beside the Base ones rather than quoted here, where a number would go stale.",
  },
];

export const BECOMING_STANDFIRST =
  "What this store is trying to prove, what it has already decided, and what it is watching for. Kept apart from everything else deliberately: /what lists only what is running today, and this page holds the part that is not built. Nothing here is a capability — every entry is either a claim with a way to show it false, a decision waiting on a trigger that has not fired, or the dated record of a watched item whose gate has since opened, kept here rather than deleted so the watch list's hits stay checkable against its misses.";

export const BECOMING_LIMIT =
  "NOTHING ON THIS PAGE IS AVAILABLE. If you are deciding whether to buy something, the page you want is /what, which lists only what is running now, or /menu.json, which is the shelf. This one exists so that the difference between those two things and this one is never left to a reader to work out — a store whose plans and whose inventory read with the same weight is asking to have both discounted at once.";

/** The day the theses were written down. */
export const BECOMING_DATED = "2026-07-30";
