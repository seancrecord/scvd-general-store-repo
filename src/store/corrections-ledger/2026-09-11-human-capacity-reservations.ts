import type { Correction } from "./types";
export const correction: Correction = {
  date: "2026-09-11",
  what_was_wrong: "Concurrent buyers could each pass the same human-queue or weekly-inventory count before either order appeared. Both payments could settle for the last available slot.",
  how_long: "Reproduced in the September buyer audit and local simultaneous-buyer tests. Those tests establish the race, not a production oversale count.",
  found_by: "The keeper-requested BUY-035 repair, with signed fixture purchases across all checkout rails, both MCP profiles, HTTP and the Commission Desk.",
  what_changed: "New human purchases reserve a slot atomically before settlement. The original purchase identity and admission time survive fulfillment retries and week boundaries. Unknown settlement keeps its hold without a timeout; confirmed non-payment or completed work releases the open slot, and a completed sale still counts against its original week. Incomplete legacy inventory refuses new reservations. Old paid obligations remain owed. The migration depends on the existing ledger projection and does not prove the absence of undiscoverable historical obligations. Regression tests force simultaneous buyers through the old count, remove the reservation path to prove failures, and exercise payment uncertainty, recovery and week boundaries. No live payment or buyer callback was sent.",
};
