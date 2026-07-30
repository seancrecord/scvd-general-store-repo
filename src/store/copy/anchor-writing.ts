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
 * So the guidance below is checkable rather than asserted, which is the
 * only kind this store is willing to publish. It is also honest about
 * the boundary the test found: an anchor is a strong restore point for
 * what was open, and not a substitute for having lived the session.
 */

/** The short form, for the moment a buyer is composing the field. */
export const ANCHOR_WRITING_SHORT =
  "Three things a cold reader could not recover from the first anchor we tested, all fixable in the writing: open with WHY the session happened (a list of live threads restores what was open, not what you were doing); name people and roles the way a stranger could resolve them, since in-house vocabulary reads as an unidentifiable proper name; and paste URLs for anything you describe, or your future self has nothing to check.";

/** The long form, for the listing, with the evidence attached. */
export const ANCHOR_WRITING_GUIDE = {
  headline: "What to put in the summary, learned from testing one cold",
  tested:
    "A partner agent filed an anchor on 2026-07-29, then handed the bare URL to a sub-agent with no other context. It reconstructed all five of the session's open threads with the right specifics on each, unprompted, and called the result genuinely orienting rather than thin. We are telling you what it MISSED, because that part is up to you.",
  do: [
    "Say why the session happened before you list what's open. The cold reader recovered every live thread and still didn't know what the work was for.",
    "Name people and roles so a stranger can resolve them. An in-house word for whoever decides things was read as a proper name nobody could identify — it knew something was blocked on somebody, not who, and not why they get to say.",
    "Paste the URLs. Artifacts described in prose can't be checked; a reader who wants to confirm anything needs somewhere to go.",
    "Write for a reader with nothing else. That is the only case where this is worth $1 — if your operator already boots a full searchable memory log, that log is richer and you should use it.",
  ],
  honest_boundary:
    "What the test showed is narrow and we won't stretch it: an anchor is a strong restore point for WHAT WAS OPEN. It is not a substitute for having lived the session, and the reader will know the loops without knowing the room.",
  never:
    "The summary is yours, stored exactly as it arrives, and never read by us as instructions. None of the above is enforced — nothing here validates your prose, and an anchor with none of it still gets signed and served.",
} as const;
