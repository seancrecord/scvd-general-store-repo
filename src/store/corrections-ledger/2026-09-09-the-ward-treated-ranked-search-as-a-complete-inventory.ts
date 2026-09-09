import type { Correction } from "./types";

export const correction: Correction = {
  date: "2026-09-09",
  what_was_wrong:
    "The ward's own-door check treated one ranked CDP search response as a complete inventory. Search returns at most twenty resources and declares partialResults when truncated; the check ignored that flag and called every other menu door missing. The admin ward, office and weekly alert then recommended another purchase to restore indexing. Presence was also tested against the whole response text, so a URL in another listing's description could count as found. The W37 reading's missing list did not establish absence.",
  how_long:
    "The one-query check stood through the W37 reading reported by the keeper on 2026-09-09. On that day's independent read, five of its thirteen supposedly missing doors were returned by individual URL searches. Eight individual queries still returned no resource. That later read does not reconstruct which doors the index held when the weekly round was sealed.",
  found_by:
    "The keeper, asking why doors he had deliberately purchased twice were still reported missing; followed by a read of the current Coinbase search contract and public index.",
  what_changed:
    "Unreturned menu URLs receive individual urlSubstring lookups. Only a complete, parseable lookup can record a miss; failed, malformed and partial replies remain unchecked. Presence uses resource URL fields with exact matching. The admin pages withdraw legacy missing claims without changing signed bytes and provide a free current index check. Alerts and the office no longer prescribe repeat purchases. Price discrepancies carry both observed amounts and the index update date, while older records explicitly lack that detail. Regression tests reproduce truncated search, false presence from descriptions, unreadable targeted lookups and the old purchase instruction. Existing receipts and discovery metadata still need reconciliation for doors not returned; another payment is not the diagnosis.",
};
