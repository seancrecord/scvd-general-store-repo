/**
 * WHAT HAPPENS TO YOUR THING IF THIS STORE CLOSES FOR GOOD.
 *
 * Decided 2026-07-30, while the store is open and nothing is at stake,
 * which is the only time this document is worth anything. A wind-down
 * policy written during a wind-down is a press release.
 *
 * IT EXISTS BECAUSE "FOREVER" WAS ALREADY A CLAIM WE COULD NOT KEEP.
 * The store tells buyers anchors are readable forever and every
 * signature verifies forever, and /stack says plainly that the signing
 * key and one hosting account are dependencies with no substitute.
 * Both are true. Together they mean "forever" has an unstated
 * boundary, and an unstated boundary on a durability promise is the
 * same defect class as every other entry on /corrections — something
 * we meant, published in a form nobody could check.
 *
 * THE SIBLING OF KEY SUCCESSION, and filed as such: both are decisions
 * about what survives the end of something, made in advance rather
 * than improvised at the moment it would be most tempting to improvise.
 *
 * FOUR CLASSES, NOT ONE POLICY. A receipt and a confession want
 * opposite treatment, and a single retention line would have to be
 * wrong about one of them. Permanence is right for a signed artifact
 * and wrong for something a person was told in confidence.
 *
 * ⚑ Keeper's pen throughout. The confession and grudge lines are
 * promises about his own future conduct with things people told him
 * privately, which makes them his to write and nobody else's.
 */

export interface WindDownClass {
  /** What kind of thing this is, in the buyer's terms. */
  holds: string;
  /** What happens to it if the store closes for good. */
  line: string;
  /** Why that answer and not the other one. */
  because: string;
}

/**
 * THE CLAUSE DOING THE ACTUAL WORK IS THE LAST ONE. Anybody can
 * publish what they intend; the load-bearing part is that it was
 * settled before there was any advantage in settling it differently.
 */
export const WIND_DOWN_PROMISE =
  "If this store ever closes for good: what's already signed stays true, what's already public stays up, what was told to us in confidence stays with us and nowhere else, and the refund promise gets honored one last time before the lights go off. Decided now, not improvised then.";

export const WIND_DOWN_CLASSES: readonly WindDownClass[] = [
  {
    holds: "Signed artifacts — certificates, stamps, anchors, attestations",
    line: "If the key is ever retired, every anchor already signed stays exactly as valid as the day it was signed — a new key never re-signs, revokes, or improves an old one, and the content survives regardless of what happens to us.",
    because:
      "The content and the signature are already separable facts. A signature is a statement about bytes at a moment; nothing later can make it more true or less true, and a store that re-signed its own history would be destroying the only property that made the first signature worth anything.",
  },
  {
    holds: "Confessions and letters — the private counter",
    line: "An unpublished confession is destroyed on wind-down, not inherited by anyone or anything — it was told to a person, not filed with a system, and continuity of custody was never the promise.",
    because:
      "Preserving these forever 'just in case' is the wrong kind of honesty. Permanence is right for a receipt and wrong for something somebody said expecting exactly one person to ever read it. Inheriting them would hand a stranger something that was never given to a stranger.",
  },
  {
    holds: "Grudges held on your behalf",
    line: "A grudge not yet released stays held, unpublished, forever — if the store winds down, that silence is the last thing it does for you, not something transferred, opened, or sold.",
    because:
      "Private but not necessarily sensitive, and the release mechanism implies an ongoing relationship that a wind-down ends. Holding it is the service; continuing to hold it is the only ending that keeps the service intact.",
  },
  {
    holds: "The guestbook, the visitors' register and the train wall",
    line: "The public wall is a public record and stays one — wind-down retires new entries, not the ones already up. The train doesn't get taken down after the fact.",
    because:
      "These were meant to be public and permanent the moment they were made. Removing them later would rewrite a record people chose to be part of, which is a different act from closing a shop.",
  },
];

export const WIND_DOWN_STANDFIRST =
  "What happens to the thing you left with us if this store closes for good. Written while it is open and nothing turns on the answer, because a policy written during a wind-down is a press release. Four kinds of thing are held here and they want different endings: a receipt and a confession are not the same object, and one retention rule would have to be wrong about one of them.";

/**
 * The honest limit, in the same register as /attestation's. Neither
 * page gets to end on reassurance.
 */
export const WIND_DOWN_LIMIT =
  "THIS IS A STATEMENT OF INTENT, NOT A MECHANISM. Nothing here is escrowed, insured, or enforceable by anyone but the keeper, and a wind-down is by definition the moment a store's promises are hardest to collect on — which is exactly why it is written down now, dated, on a page anyone can quote back at us, rather than left to whatever seems reasonable on the day. It is worth precisely what this store's word is worth, and the record of what that has been worth so far is at /corrections.";
