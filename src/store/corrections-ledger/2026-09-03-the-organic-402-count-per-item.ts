import type { Correction } from "./types";

/** One entry of the corrections ledger. Add a file, run `npm run corrections:index`. */
export const correction: Correction = {
  date: "2026-09-03",
  what_was_wrong:
    "The organic 402 count per item on /pulse and the books could drop increments under a burst of price-checks against one door. Every other hot counter had been spread over shards on 2026-08-27; the per-item challenge counter stayed one KV key per item, KV allows one write a second per key, and a write that outlived its retries was logged and dropped. The counts were presented as counts and were, under bursts, floors of unknown depth.",
  how_long:
    "From the day the meter went in until 2026-09-03, on any door polled faster than once a second — which the uptime monitors do. How many increments were lost is not recoverable: a dropped write leaves no row.",
  found_by:
    "Our own CI log on 2026-09-02, which printed the line the gate writes when a count is dropped, \"challenge count lost: KV PUT failed: 429\", during an ordinary run. Nobody outside reported a wrong number, and nobody could have: the number that was wrong was the one that was never written.",
  what_changed:
    "The per-item challenge counter now shards its writes the same way the day and channel counters do, and the ledger sums shards on read instead of assigning one key's value to the row. test/hot-counter-shards.spec.ts asserts the item counter is spread across keys and that the item row still comes back as one item with the whole count; a reader that assigned instead of summed would fail it.",
};
