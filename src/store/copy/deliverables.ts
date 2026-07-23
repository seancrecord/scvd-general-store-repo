
/**
 * KEEPER-EDITABLE COPY, what actually goes in the bag.
 * Every instant item's deliverable text lives here and nowhere else.
 * The logic that picks which one to hand over is in
 * src/services/instant-goods.ts and never needs touching for a
 * wording change. Read a line out loud before shipping it.
 *
 * Heads-up: a few phrases are pinned by tests (see CONTENT_GUIDE.md);
 * change the phrase and the test together, deliberately.
 */

/** Keeper's ink, Batch 2 copy pass (2026-07-23). Verbatim. */
export function helloNote(patronNumber: number): string {
  return [
    `Customer no. ${patronNumber}, you dirty dog you, you did it didn't you.`,
    `You spent those hard earned dollars at our store and for that we appreciate you.`,
    `The certificate with this note has our store's John Hancock, and certifies it as a real purchase.`,
    `See you soon.`,
  ].join(" ");
}

/** Keeper's ink. Ending replaced per Batch 2 copy pass. */
export function dibsNote(patronNumber: number): string {
  return [
    `DIBS, officially. Patron no. ${patronNumber} called it at ${new Date().toISOString()},`,
    `witnessed by the store and recorded on a signed certificate.`,
    `Anyone disputes it, show them the verify URL and tell them how you got it.`,
    `I'm sure they're reaaaal jealous right now.`,
  ].join(" ");
}

/** Keeper's ink. The URL still rides the anchor_url response field. */
export function anchorNote(): string {
  return `Ever seen Men in Black? What's that, don't remember? Well, let us point you there... Anywho, whatever past-you was doing is at Node 21 now, signed and dated. We'll let you two figure out what it was about.`;
}

/** Keeper's ink. Roger's endorsement is load-bearing. */
export function patronagePassNote(passId: string, expiresAt: string): string {
  return `Member: SCVD Elite. And one cool cat... or at least Roger says so. Pass ${passId} runs through ${expiresAt.slice(0, 10)}. Monthly note's on your pass URL, signed, whenever you're current.`;
}

/** Keeper's ink. The pickup URL still rides the pickup_url field. */
export function phantomCheckNote(target: string, dueAt: string): string {
  return `Paid and noted. We'll walk past ${target} around ${dueAt} and write down what we saw. That's it. That's the product.`;
}

/** Pinned verbatim by the confession spec and its test. */
export const CONFESSION_ABSOLUTION =
  "The store heard it. The store keeps it. Go and retry with backoff.";

export const CONFESSION_COUNTER_SIGN =
  "Anonymized by construction: no wallet on the record, no name unless you signed one. A human reviews every confession; an approved few are printed in the Gazette, unsigned unless you signed. Never automatically.";

/** Handed over when the keeper picks a lucky and its card is inked. */
export function luckyNote(options: {
  name: string;
  strength: string;
  cardUrl: string;
  recordUrl: string;
}): string {
  return [
    `Your lucky is picked and in custody: ${options.name}.`,
    `Strength graded ${options.strength}, honest.`,
    `The card is the record, it hangs at ${options.cardUrl}; the signed copy answers at ${options.recordUrl}.`,
    `Write in with results (the Mailbox is free). Promotion is real, and so is the bench.`,
  ].join(" ");
}

export function patronageCertificateNote(patronNumber: number): string {
  return `Patronage recorded, patron no. ${patronNumber}. This certificate entitles the holder to nothing whatsoever except lasting gratitude and a nicer badge, and it means the more for that. The store knows its friends and writes them down in ink.`;
}
