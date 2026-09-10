import type { Correction } from "./types";

export const correction: Correction = {
  date: "2026-09-10",
  what_was_wrong: "The same-key retry promise did not cover concurrent fresh payment authorizations. Two requests could both miss the response cache and settle separately. Some purchase instructions also said idempotency could never refuse a purchase, although uncertainty must stop another settlement.",
  how_long: "The cache-only safeguard was introduced August 1; the buyer audit reproduced the race with local signed fixtures on September 6. This is a verified implementation defect, not a count of affected live buyers.",
  found_by: "The keeper-requested buyer audit, followed by a controlled test that pauses one settlement while a second authorization arrives with the same purchase key.",
  what_changed: "New keyed purchases atomically retain one payment identity before settlement. Concurrent duplicates return the original purchase or its status; unavailable admission stops settlement. The claim persists beyond the response cache and survives object eviction. Tests cover every catalogue product, every configured fixture rail, both MCP profiles, HTTP, commissions and paid publications, plus lost storage replies and unavailable records. Historical purchases without a retained key association cannot acquire that missing history from this change. Expired authorization verification and lost recovery handles remain separate repairs.",
};
