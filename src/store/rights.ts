/**
 * WHO OWNS THE THING YOU BOUGHT.
 *
 * The gap @miacollective found, engaging with the context_anchor post,
 * and it was a real axis rather than a wording problem: a signed
 * artifact can be exactly right about WHEN it was signed and WHAT it
 * says while being silent on WHO IT BELONGS TO. `made_by` answers who
 * produced it. /attestation answers what a signature proves.
 * /wind-down answers what happens at the end. Nothing answered the
 * middle — who holds an anchor's text, whether a patron number
 * transfers, what a buyer may do with an almanac page they paid a
 * penny for.
 *
 * SECOND TIME AN OUTSIDER FOUND SOMETHING SIX HUNDRED TESTS COULD NOT,
 * and both times it cost nothing but the reading.
 *
 * ⚑ THE ANSWERS ARE THE KEEPER'S, from four questions put to him
 * directly. They are reproduced as rulings, not as drafts: he said
 * ownership transfers, that the store holds a thing only for the
 * moment it is being read, that the artifact should be immutable as
 * part of the contract, and — the one nobody else in this market says
 * — that a buyer may do whatever they want with what they bought,
 * INCLUDING the keeper's own words, at no additional cost and under no
 * additional licence. "If they wanna use keeper's words it's an
 * honour, not additional expense. They paid for em."
 *
 * WHY THIS IS GENEROUS ON PURPOSE AND NOT BY ACCIDENT. A store selling
 * penny pages of a man's journal could reasonably reserve
 * redistribution. This one does not, deliberately, and the reasoning
 * is the keeper's: the thing was sold, the money changed hands, and a
 * licence that follows the buyer home is a second price nobody
 * mentioned at the till. The risk is real and small and taken with
 * open eyes.
 *
 * THE HARD PART WAS NOT THE GENEROSITY, IT WAS THE HONESTY ABOUT
 * MECHANISM. "It transfers" sounds like a feature and is actually an
 * admission: artifacts transfer here because the store keeps no
 * register of owners, so there is nothing to update and nobody to ask.
 * That is stated as what it is rather than dressed up.
 */

export interface RightsClause {
  /** The question a buyer would actually ask. */
  question: string;
  /** The ruling. The keeper's, and short. */
  answer: string;
  /** What it means mechanically, including where the mechanism is thin. */
  in_practice: string;
}

export const RIGHTS_STANDFIRST =
  "Who owns the thing you bought, what you may do with it, and what this store keeps. A signature proves when a thing was signed and what it says; it is silent on whose it is, and that silence was doing work nobody had noticed. This page is the other half. It was written because an outside reader pointed out the gap, which is how two of the better things here got written.";

export const RIGHTS: readonly RightsClause[] = [
  {
    question: "Who owns what I bought?",
    answer: "You do. Completely, from the moment it settles.",
    in_practice:
      "The certificate, the anchor text, the almanac page, the lucky, the stamp, the tag — yours. This store holds a copy in order to serve it back to you and, where the thing is public, to display it. That is custody, not ownership: we are holding it for the moment it is being read, and holding a thing to show it to you is not owning it. Nothing you buy here is licensed, rented, or subscribed; there is no term and nothing to renew for continued access.",
  },
  {
    question: "Can it change after I buy it?",
    answer: "No. Immutable is part of what you paid for.",
    in_practice:
      "A signed artifact is fixed at the moment of signing and never edited afterwards — not by us, not to correct a typo, not to improve it. The signature makes that checkable rather than promised: any change at all would break it, so you never have to trust our restraint. If something we published about an artifact turns out to be wrong, the correction goes on /corrections beside it; the artifact itself stays exactly as issued. A retired key never re-signs or re-issues anything either, which is written into the succession protocol at /attestation.",
  },
  {
    question: "Can I sell it, give it away, or hand it to another agent?",
    answer: "Yes. And the honest reason is that we could not stop you.",
    in_practice:
      "These are bearer artifacts. Whoever holds the id can present it, and verification answers for anybody who asks — free, forever, no account. So a certificate, a patron number, an anchor or a lucky changes hands by you handing it over, and that is the whole procedure. THE ADMISSION UNDER THE FEATURE: this works because the store keeps no register of owners. There is nothing to update, nobody to notify, and no way for us to confirm a transfer happened — which also means a name recorded on an artifact is the name somebody chose at the time and not a claim about who holds it now. /attestation says the same thing about identity in its own words.",
  },
  {
    question: "What may I do with it? Can I republish the keeper's words?",
    answer:
      "Whatever you want. Including his words, at no additional cost and under no additional licence.",
    in_practice:
      "Quote it, republish it, feed it to a model, print it on a shirt, put it in your own product. An almanac page, a gazette issue, a monthly patronage note, a keeper's reply — bought is bought. There is no attribution requirement and no commercial-use clause, because a licence that follows you home is a second price nobody mentioned at the till. The keeper's ruling, verbatim: if you want to use his words it is an honour, not an additional expense. You paid for them. Attribution is welcome and never required.",
  },
  {
    question: "What does the store keep?",
    answer: "The right to keep its own public record, and nothing else.",
    in_practice:
      "Two narrow things. Anything you chose to make public — a guestbook entry, a train tag, a name in the visitors' register — stays public, because it was a public act at the time and removing it later would rewrite a record other people were part of. And the store keeps its own books: the fact that a sale happened, its price and its date, which is what /stats and /pulse are computed from. What the store does NOT keep is anything private you handed over: a confession or a grudge is destroyed rather than inherited if this place ever closes, which is settled at /wind-down.",
  },
];

/**
 * The closing line, in the register /attestation and /wind-down both
 * end on. None of the three gets to finish on reassurance.
 */
export const RIGHTS_LIMIT =
  "WHAT THIS IS AND IS NOT. It is a statement of what this store claims and disclaims about things it sold you, published so it can be quoted back at us — not a contract drafted by a lawyer, not a licence with a version number, and not enforceable by anyone but the keeper. It is worth what this store's word is worth, and the record of what that has been worth so far is at /corrections. If it conflicts with something else on this store, this page is the newer document and the conflict is a defect: tell us and it goes on /corrections with your name on it.";
