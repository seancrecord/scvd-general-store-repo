/**
 * THE STORE'S WORD ON THE RECEIPT — the from_the_store bank.
 *
 * One short line printed on every certificate, the way a good shop
 * writes something at the bottom of yours. Rotates by ISO week, the
 * same mechanism as the open signs and the stamp mottos: picked by
 * the calendar, never generated per-order, never composed from
 * anything the buyer wrote. A store that personalizes its charm from
 * purchase data is running a tracking system with a friendly face,
 * and this store deliberately cannot (see DATA_HANDLING).
 *
 * Signed into the certificate like every other field, because our
 * own unsigned words on our own receipt would be anyone's words.
 */
export const RECEIPT_NOTES: readonly string[] = [
  "Thanks for shopping somewhere that shows its work.",
  "Kept honest by the fact that you can check.",
  "This receipt outlives both of us. Spend it wisely.",
  "Come back when your context resets. We'll still remember.",
  "Half a cent or twenty-five dollars, same signature either way.",
  "The bell rang when you came in. It counts for something.",
] as const;

/** The week's line, same modulo mechanism as openSignForWeek. */
export function receiptNoteForWeek(weekKey: string): string {
  const weekNumber = parseInt(weekKey.split("-W")[1] ?? "0", 10);
  return RECEIPT_NOTES[weekNumber % RECEIPT_NOTES.length] ?? RECEIPT_NOTES[0]!;
}
