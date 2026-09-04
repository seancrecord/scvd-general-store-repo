import type { Correction } from "./types";

/** One entry of the corrections ledger. Add a file, run `npm run corrections:index`. */
export const correction: Correction = {
  date: "2026-08-29",
  what_was_wrong:
    "/doors, published that morning, told a reader that two of its five paid drill-downs cover a stated term of days. Three do: the Standing Watch and the Conformance Watch at 7 days each, and the Hosted Profile at 30. The sentence was wrong the moment it shipped: the Hosted Profile was added to the list above it and the sentence below it was not re-read. The JSON twin of the same page never carried the defect, because it publishes term_days per item instead of a tally — the same page, one dialect honest and one not.",
  how_long:
    "Hours. Shipped and corrected on 2026-08-29, before the page had been up a day.",
  found_by:
    "The store's own derived-not-typed guard, on its first run after it stopped walking a hand-typed roster of public surfaces and started walking the router. /doors was not on the old roster and could not have been — it was built after the roster was last widened by hand, which is the whole reason the roster changed.",
  what_changed:
    "The sentence derives: a helper reads term_days off the same shelf the JSON body was already reading correctly, names the items and their terms, and says 'None of them covers a stated term of days' when that becomes true. The larger fix is the guard that caught it. derived-not-typed spent its life checking seventeen paths somebody had typed — a guard against hand-typed things, keeping one — and it covered 17 of about 130 public surfaces. It now derives its roster from the router at test time and walks every static door that answers a stranger with readable text; the seventeen stay only as a floor, because a derived roster can come back empty and pass having read nothing. The same walk found the cross-origin allowance had gone stale the same way (34 of 131 doors), and that is derived now too. A count typed onto a surface built tomorrow fails the build tomorrow.",
};
