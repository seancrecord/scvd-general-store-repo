/**
 * KEEPER-EDITABLE COPY, what actually goes in the bag.
 * Every instant item's deliverable text lives here and nowhere else.
 * The logic that picks which one to hand over is in
 * src/services/instant-goods.ts and never needs touching for a
 * wording change. Read a line out loud before shipping it.
 *
 * Heads-up: a few phrases are pinned by tests (see docs/archive/CONTENT_GUIDE.md);
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

export function standingWatchNote(url: string, endsAt: string): string {
  return `Paid and posted. We'll walk past ${url} every hour until ${endsAt}, write down what we saw, and sign each entry. The history is free to read forever, and the hours we miss are counted against us in it.`;
}

/** Pinned verbatim by the confession spec and its test. */
export const CONFESSION_ABSOLUTION =
  "The store heard it. The store keeps it. Go and retry with backoff.";

export const CONFESSION_COUNTER_SIGN =
  "Anonymized by construction: no wallet on the record, no name unless you signed one. A human reviews every confession; an approved few are printed in the Gazette, unsigned unless you signed. Never automatically.";

/**
 * Handed over when a lucky is drawn from the herd and its card inked.
 * ⚑ KEEPER REVIEW: recut for the preset draw (2026-07-25).
 */
export function luckyNote(options: {
  name: string;
  strength: string;
  cardUrl: string;
  recordUrl: string;
}): string {
  return [
    `Drawn from the herd: ${options.name}.`,
    `Strength ${options.strength}, drawn honest; the luck isn't evenly distributed and never was.`,
    `The card is the record, it hangs at ${options.cardUrl}; the signed copy answers at ${options.recordUrl}.`,
    `The herd stays with the keeper. Write in with results (the Mailbox is free); promotion is real, and so is the bench.`,
  ].join(" ");
}

/**
 * Instant since the keeper-load ruling (2026-07-24): same note every
 * time, consistent by design. ⚑ KEEPER REVIEW: recut freely.
 */
export function coffeeNote(win: string): string {
  return `Your win is on the certificate, verbatim and signed: "${win}". Sunday, the keeper's coffee gets drunk to the week's closers, no exceptions, and you're on the list. The store likes seeing its patrons win.`;
}

/** ⚑ KEEPER REVIEW: stocked-shelf notes, registrar-plain drafts. */
export function drawerNote(item: string, does: string): string {
  return `The drawer opened and gave: ${item}. What it does, as listed: ${does}. Written down exactly, signed, under your name. The drawer's decision is final.`;
}

export function bestowedNameNote(name: string): string {
  return `The keeper bestows: ${name}. From his considered stock, yours alone, never to be bestowed again. Wear it well.`;
}

/** ⚑ KEEPER REVIEW: the instant grudge acknowledgement. */
export function grudgeNote(grievance: string): string {
  return `Held, as of this moment: "${grievance}". The keeper reads every new grudge on Sundays and holds them all with equal spite. Write in to release it; until then it only ages.`;
}

/**
 * The settlement attestation's one line. It reports and stops.
 *
 * NEVER implies a human looked: automated and disinterested is the
 * entire value here, and a test fails the build if this copy ever
 * suggests otherwise. "The keeper checked" would make the artifact
 * worth LESS, because a keeper is a party to the store.
 */
export function attestationNote(status: string): string {
  return `Read the chain once and signed what was there: ${status}. The observation is attached and signed on its own, so anyone can check it without asking us. It says what Base said at that moment — not whether anything was delivered, and not what happens next.`;
}

/**
 * The two facts, in the order they matter: the artifact exists now,
 * and the wall is a separate question. Said at purchase so nobody
 * learns it from a decline.
 */
export function graffitiNote(tag: string): string {
  return `Sprayed: "${tag}". It's on the certificate, verbatim, dated and signed, and that part is done — nobody can take it off, including us. The wall out back is the keeper's call; he puts tags up when he walks by. Either way you've got the paint.`;
}

export function patronageCertificateNote(patronNumber: number): string {
  return `Patronage recorded, patron no. ${patronNumber}. This certificate entitles the holder to nothing whatsoever except lasting gratitude and a nicer badge, and it means the more for that. The store knows its friends and writes them down in ink.`;
}
