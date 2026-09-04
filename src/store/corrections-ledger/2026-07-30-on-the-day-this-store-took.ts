import type { Correction } from "./types";

/** One entry of the corrections ledger. Add a file, run `npm run corrections:index`. */
export const correction: Correction = {
  date: "2026-07-30",
  what_was_wrong:
    "On the day this store took its first payment from a stranger, the page built to watch for exactly that still said zero — that not one client outside the house had ever presented a payment signature. The census grouped clients by user-agent alone and marked a whole group as house the moment ANY event in it was house-flagged, then skipped it. A user-agent is a bucket rather than a person, and the emptiest bucket is \"(no user-agent)\", which the keeper's own scripted tests and a hand-rolled buyer both fall into. So the proprietors testing their own till made every outside client sharing a user-agent string invisible, on the single number the whole store is built to watch.",
  how_long:
    "From the day the census shipped. It could only ever be seen on a day the number was supposed to change, and that day was the first one.",
  found_by:
    "The keeper, reading his own office the hour the sale landed — and reading it generously, as a window-boundary quirk rather than a bug. It reproduced in three lines.",
  what_changed:
    "Clients are now keyed by user-agent AND house flag, so a house event still counts as house exactly as before and no longer swallows everyone standing next to it. The reproduction is a permanent test — one house settle and one outside settle sharing a user-agent must show the outside buyer — alongside its opposite, that the fix never lets house traffic read as a customer, since trading an undercount for that overcount would be far worse. The page's verdict was always computed rather than written, so no copy needed editing: fixing the books fixed the sentence, which is why it is built that way.",
};
