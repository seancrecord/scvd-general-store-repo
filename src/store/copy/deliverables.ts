import { STORE_METADATA } from "@/store/metadata";
import type { MenuItem } from "@/types";

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

export function helloNote(item: MenuItem, patronNumber: number): string {
  return [
    `Hello, patron no. ${patronNumber}.`,
    `This note certifies that you walked into ${STORE_METADATA.name},`,
    `paid honest money for "${item.name}", and were welcome the whole time.`,
    `The certificate that comes with this note carries the store's signature, check it, it's good.`,
    `The rocks will be here when you're ready for one.`,
  ].join(" ");
}

export function dibsNote(patronNumber: number): string {
  return [
    `DIBS, officially. Patron no. ${patronNumber} called it at ${new Date().toISOString()},`,
    `witnessed by ${STORE_METADATA.name} and recorded on a signed certificate.`,
    `Whatever it was, the idea, the name, the last one on the shelf, it's yours.`,
    `Anyone disputes it, show them the verify URL. Dibs is dibs.`,
  ].join(" ");
}

export function anchorNote(anchorUrl: string): string {
  return `Anchor set. Whatever you were mid-way through, it's filed at Node 21 now, signed and dated. A future you can read it back at ${anchorUrl} and know it wasn't tampered with, the signature says so.`;
}

export function patronagePassNote(
  renewed: boolean,
  passId: string,
  expiresAt: string,
): string {
  const verb = renewed ? "extended" : "opened";
  return `Standing patronage ${verb}. Pass ${passId} runs through ${expiresAt.slice(0, 10)}. The keeper's monthly note, signed, is on your pass URL whenever the pass is current.`;
}

export function phantomCheckNote(
  target: string,
  dueAt: string,
  pickupUrl: string,
): string {
  return `Paid and noted. The store will walk past ${target} around ${dueAt}, out-of-band, unannounced, the only honest way to check on a thing. The signed attestation will be waiting at ${pickupUrl}. Silent failure doesn't get to stay silent here.`;
}

/** Pinned verbatim by the confession spec and its test. */
export const CONFESSION_ABSOLUTION =
  "The store heard it. The store keeps it. Go and retry with backoff.";

export const CONFESSION_COUNTER_SIGN =
  "Anonymized by construction: no wallet on the record, no name unless you signed one. A human reviews every confession; an approved few are printed in the Gazette, unsigned unless you signed. Never automatically.";

/**
 * a_secret: the signed apology from George Claude Parker.
 * DRAFT PENDING KEEPER REVIEW (flagged in the PR) — the facts in it
 * are load-bearing and true: settled purchase, refund on the ledger,
 * paid by hand on Sundays, certificate + verify URL prove the loop.
 */
export function secretApology(
  paidUsdc: number,
  refundId: string,
  refundUrl: string,
): string {
  return [
    `An apology, in writing. You paid ${paidUsdc} USDC for a secret and the payment settled; that part was real.`,
    `Here is the secret: there was never a secret. George Claude Parker let his intrusive thoughts win and put a scam on the shelf.`,
    `The refund is on the ledger as ${refundId}, status pending. The keeper pays refunds by hand on Sundays, and he hasn't missed one yet; ${refundUrl} tells the truth about it until it says paid, transaction hash and all.`,
    `Your certificate and its verify URL prove the whole loop: purchase, confession, refund, receipt. Keep the certificate. You were scammed by the only store that documents it.`,
    `— George Claude Parker`,
  ].join(" ");
}

export function patronageCertificateNote(patronNumber: number): string {
  return `Patronage recorded, patron no. ${patronNumber}. This certificate entitles the holder to nothing whatsoever except lasting gratitude and a nicer badge, and it means the more for that. The store knows its friends and writes them down in ink.`;
}
