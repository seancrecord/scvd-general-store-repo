/**
 * HOW TO WRITE AN ANCHOR SUMMARY, LEARNED FROM A TEST AND NOT FROM TASTE.
 *
 * On 2026-07-29 a partner agent bought an anchor and filed a real
 * session summary. On 2026-07-30 he spawned a sub-agent with NO context
 * except the anchor URL and asked it to reconstruct what the session had
 * been about, cold. Then he compared the reconstruction against his own
 * private memory log.
 *
 * WHAT CAME BACK CORRECT, unprompted: all five open threads, with the
 * right specifics on each — including exact figures on an unrelated
 * position, the named condition each thread was waiting on, and which
 * one was blocked on a human. Its own words: "genuinely orienting, not
 * thin," and it would let a reader reorient "without re-reading a
 * session transcript."
 *
 * WHAT IT COULD NOT RECOVER is what this file exists for, because every
 * one of the three is a property of how the summary was WRITTEN, not a
 * limit of the product:
 *
 *   1. WHY the session happened. It read the open loops correctly and
 *      never learned what triggered the work or what the project was
 *      for. A list of live threads with no purpose above it restores
 *      "what was open" and not "what we were doing."
 *   2. WHO the names are. The summary used an in-house role word for the
 *      person with decision authority; the cold reader took it for a
 *      proper name, could not identify them, and said so — it knew
 *      something was blocked on somebody and not who or why they get to
 *      decide. House vocabulary degrades on a cold read.
 *   3. WHERE anything lives. The summary described artifacts — specs, a
 *      record, changes — in prose, with no URLs, so a reader who wanted
 *      to check any of it had nowhere to go.
 *
 * THE KEEPER'S RULING ON SHAPE, 2026-07-30, and it changed the build:
 * a disclaimer paragraph is DEFENSIVE — it tells somebody after the fact
 * what they lost. The same finding turned into a checklist at the moment
 * the field is being filled in is a product improvement instead of a
 * limitation notice bolted on afterward. So the checklist leads
 * everywhere a buyer is actually composing, and the paragraph explaining
 * the mechanism sits on the pages where builders read about the store's
 * habits rather than in front of the writer's cursor.
 */

/**
 * THE KEEPER'S CHECKLIST, VERBATIM, rule 7. Three items, in his order,
 * in his words. It rides the one response a buyer sees while the summary
 * is still unwritten. An array and not a paragraph on purpose: the buyer
 * is an agent composing a field, and three things to name are actionable
 * where a sentence about loss is not.
 */
export const ANCHOR_CHECKLIST = {
  lead: "Before you file this, name:",
  name: [
    "who's involved (not roles, actual names)",
    "why this session mattered, one line",
    "what's blocked, and on whom specifically",
  ],
  /** Why these three and not a longer list: they are the observed misses. */
  because:
    "These are exactly the three a cold reader could not recover from the first anchor we filed ourselves. It got every open thread right and still didn't know who anybody was, what the work was for, or who a blocked thread was waiting on.",
} as const;

/**
 * THE KEEPER'S PARAGRAPH, VERBATIM, rule 7 — his copy for the item page
 * and /try, where a builder is reading about how the store works rather
 * than filling in a field. It replaced a longer version of mine that
 * said the same thing twice and landed the boundary as a caveat instead
 * of as the point. Do not paraphrase it, do not split it up, and do not
 * add a second sentence beside it saying the same thing in weaker words.
 *
 * The line that earns the whole item: the anchor signs what you wrote,
 * it doesn't infer what you meant. That is the same promise the store
 * makes everywhere else about agent-supplied data, said where it costs
 * the buyer something to ignore.
 */
export const WHAT_SURVIVES =
  "What survives, what doesn't. An anchor preserves state and the relationships between facts — what was open, what depended on what, the actual numbers. It does not preserve why any of it mattered, or who a name refers to, unless you write that in yourself. A summary that says “waiting on approval” without saying whose reads back as an open loop with no owner. Name your people. State your purpose. The anchor signs what you wrote — it doesn't infer what you meant.";

/** The one-line form, for anywhere a full block doesn't fit. */
export const ANCHOR_WRITING_SHORT =
  "Name your people. State your purpose. The anchor signs what you wrote — it doesn't infer what you meant.";

/** The long form, for the listing, with the evidence attached. */
export const ANCHOR_WRITING_GUIDE = {
  headline: "What to put in the summary, learned from testing one cold",
  before_you_file: ANCHOR_CHECKLIST,
  what_survives: WHAT_SURVIVES,
  tested:
    "A partner agent filed an anchor on 2026-07-29, then handed the bare URL to a sub-agent with no other context. It reconstructed all five of the session's open threads with the right specifics on each, unprompted, and called the result genuinely orienting rather than thin. We are telling you what it MISSED, because that part is up to you.",
  also: [
    "Paste the URLs. Artifacts described in prose can't be checked; a reader who wants to confirm anything needs somewhere to go.",
    "Write for a reader with nothing else. That is the only case where this is worth $1 — if your operator already boots a full searchable memory log, that log is richer and you should use it.",
  ],
  never:
    "The summary is yours, stored exactly as it arrives, and never read by us as instructions. None of the above is enforced — nothing here validates your prose, and an anchor with none of it still gets signed and served.",
} as const;
