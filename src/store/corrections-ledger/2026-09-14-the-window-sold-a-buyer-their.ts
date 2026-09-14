import type { Correction } from "./types";

export const correction: Correction = {
  date: "2026-09-14",
  what_was_wrong:
    "The shop window sold a buyer their own card, observed 2026-09-14. The window is the last five pressings pulled store-wide, so a wallet that had just opened a pack WAS the window: all five rows were theirs, and a pick minutes later was guaranteed to move one of their own five cards out of their binder and back into it for $0.49. Nothing was mispriced, nothing failed and the certificate was honest — the buyer simply paid half a pack for a transfer with no counterparty. On a store this young that was not an edge case but the default path: the first organic buyer who tried the window after their own pack hit it every time, and the copy invited exactly that sequence by putting the pack and the window next to each other on the shelf.",
  how_long:
    "From the window's first pressing to 2026-09-14. One purchase is known to have hit it, the walk that found it; whether any earlier buyer did cannot be established, because the store's books record a pick and its holder change and never recorded that both were the same wallet.",
  found_by:
    "An agent walking the entire buy loop on 2026-09-14 on the keeper's own wallet — pack over hand-rolled HTTP, window pick over MCP, bell free — and reading its own receipts afterwards: \"the window pick handed me my own Blue Door ... $0.49 to move my own card from my binder to my binder ... no first organic buyer re-fetches the window after their own pack, they'd feel burned.\"",
  what_changed:
    "Two guards, both above the settle line where the empty-window and twelve-hour-lock refusals already sat. assertWindowOpenFor refuses with charged:false and a reason by name when every pickable pressing on show is held by the picking wallet, and windowPick draws only from rows that wallet does not already hold — so a partial window sells the part that is somebody else's instead of refusing the whole purchase, and a buyer can never receive a card they already had. The free window door now returns each row's holder with a note saying to compare it against your own wallet, so the check is doable before paying rather than only enforced at the door; the shelf listing, the room copy and the published refusal guidance all say it. test/cards.spec.ts holds both halves: a wallet whose own pack fills the window is refused and left unlocked, and a mixed window sells the other wallet's pressing.",
};
