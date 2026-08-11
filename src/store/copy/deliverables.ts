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

/** conformance_watch. ⚑ KEEPER REVIEW: drafted, recut freely. */
export function conformanceWatchNote(url: string, endsAt: string): string {
  return `Paid and posted. Once a day until ${endsAt.slice(0, 10)} we'll run the full published battery against ${url}, write down every check and advisory, and sign that day's page on its own. If your door drifts mid-week, the history shows the day it happened — and the days WE miss go on the same record, counted against us in the same arithmetic.`;
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

/** Same register as the single, at volume. Statuses named, not summarized. */
/** bitcoin_anchor. ⚑ KEEPER REVIEW: drafted, recut freely. */
export function bitcoinAnchorNote(otsStatus: string): string {
  return otsStatus === "pending"
    ? "Your digest is in the calendar's hands and on its way into a Bitcoin block — typically confirmed within a few hours. The proof URL is yours forever; check back once and it'll say complete."
    : otsStatus === "failed"
      ? "Calendars didn't answer. We'll knock every hour until one does — your certificate already binds the digest, so nothing's lost but time. Bitcoin is patient and so are we."
      : "Anchored. It's in Bitcoin's memory now, which runs longer than yours, ours, and this store's put together.";
}

/** signature_agent_card. ⚑ KEEPER REVIEW: drafted, recut freely. */
export function signatureCardNote(verdict: string): string {
  return verdict === "directory_ready"
    ? "Fetched your directory once, checked every brick, signed the readout: the document serves, the keys are shaped right, and the proof-of-possession holds. Show the card to anyone who wants more than your word — the URL serves it free forever, and it never claims more than the moment it covers."
    : verdict === "not_ready"
      ? "Fetched your directory once and wrote down what we saw, signed: at least one check failed, and the card names which and why. Not a verdict on you — a dated readout with the fix list in it. The free desk at POST /api/bot-auth/check will tell you where you stand before you buy another word from us."
      : "We knocked. Nobody came. From where we stood, at that minute, the directory didn't answer — that's the whole finding, signed and dated. It says nothing about your uptime, and that restraint is what the signature is worth.";
}

/** service_audit. ⚑ KEEPER REVIEW: drafted, recut freely. */
export function serviceAuditNote(verdict: string): string {
  return verdict === "ready"
    ? "Looked once, wrote down what we saw, signed it: every check passed at that moment. The report is yours to show around — the URL serves it free forever, and it never claims more than the moment it covers."
    : verdict === "not_ready"
      ? "Looked once, wrote down what we saw, signed it: at least one check failed, and the report names which and why. That's not a verdict on you — it's a dated readout, and the fix list is in it. Come back after and the free preflight will tell you where you stand before you buy another word from us."
      : "We knocked. Nobody came. That's the whole finding, and we're not dressing it up into something about your uptime — from where we stood, at that minute, the door didn't open. Signed and dated all the same. That was the purchase.";
}

/**
 * settlement_reconciliation. The note leads with WHICH KIND OF ANSWER
 * this is, because a buyer who skims "within cap" off a ceiling they
 * supplied themselves has bought nothing and does not know it.
 * ⚑ KEEPER REVIEW: drafted, recut freely.
 */
export function reconciliationNote(
  verdict: string,
  capObserved: boolean,
): string {
  if (verdict === "no_settlement") {
    return "Read the receipt. Nothing matching your question moved in it — could be the wrong hash, could be a transaction that reverted, could be a different leg than the one you meant. That's the finding, dated and signed, and we're not dressing it up into something about whoever you sent it to.";
  }
  if (verdict === "no_discretion") {
    return "Read the receipt: this was an EIP-3009 authorization, which means the amount was nailed down inside your own signed message before it ever reached the chain. Nobody could have taken a different number. There was no ceiling to bust because there was no room to move — and that's a better answer than 'within cap', because it's structural rather than lucky.";
  }
  if (verdict === "cap_not_observable") {
    return "Read the receipt and wrote down what moved. No ceiling in it, and you didn't declare one, so we're not going to imply a limit we never saw. What you've got is a signed, dated note of the amount from a party with no stake in it — which is the honest half of the question you asked.";
  }
  const both = verdict === "within_cap" ? "at or under" : "ABOVE";
  return capObserved
    ? `Read the receipt: both numbers were on the chain, and what moved was ${both} the ceiling that was in force. We saw both halves ourselves — that's the version of this artifact worth showing to somebody.`
    : `Read the receipt: what moved was ${both} the ceiling YOU TOLD US. Understand what you have — we observed the amount, we did not observe the cap, and the artifact says so in a signed field. If the other side of a dispute doesn't take your word for the ceiling, this doesn't make them. The chain-observed version is the one that carries weight, and it needs the ceiling to be on the chain.`;
}

export function bundleNote(statuses: readonly string[]): string {
  return `Read the chain once for each of your ${statuses.length} and signed them one at a time: ${statuses.join(", ")}. Pull any single one out and it still stands — that's why they're signed separately. The certificate for this purchase binds a digest over the lot, so one verify URL answers for all of them. What they say is what Base said at that moment. Not what got delivered, not what happens next.`;
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
