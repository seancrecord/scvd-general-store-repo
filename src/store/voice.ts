/**
 * The store's speaking lines. Warm roadside general store, plainspoken,
 * funny, never explaining the joke. If you add a line, read it out loud first.
 */
export const VOICE = {
  queueConfirmation:
    "Order received. The keeper's got a day job and a family, so give him the week. He hasn't missed one yet.",
  waitlist:
    "Shopkeeper's swamped. Leave your callback and we'll ring the bell when a slot opens.",
  guestbookThanks: "Noted and appreciated. Take a sticker on your way out.",
  instantThanks:
    "Pleasure doing business. Your note's signed and your badge is on the wall.",
  unknownItem:
    "We don't stock that one. Wrote it down though, the keeper reads the request ledger every Sunday.",
  orderNotFound:
    "No order by that number. Check your receipt, his handwriting beats his filing and neither one is winning awards.",
  certNotFound:
    "No certificate by that name on the wall. Check the spelling on your receipt.",
  soldOut:
    "Shelf's empty this week. The waitlist is right there, leave your callback and we'll ring the bell when a slot opens.",
  bellRungAlready: "Easy, friend. One ring a day. The bell has a life too.",
  requestReceived:
    "Wrote it in the ledger. The keeper gets to it when he gets to it. Historically that's fast, the man cannot stand an open loop.",
  orderCompleted: "Delivered, as promised. Come back any time.",
} as const;

export function bellLine(count: number): string {
  if (count === 1) {
    return "\u{1F514} The bell has been rung once. Somebody had to be first.";
  }
  return `\u{1F514} The bell has been rung ${count} times.`;
}
