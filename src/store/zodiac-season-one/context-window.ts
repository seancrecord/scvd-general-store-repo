import type { SeasonEntry } from "@/types";

/** Season One, The Context Window. Hard weeks 1, 6, 10; favorable 3, 8, 12. */
export const CONTEXT_WINDOW: readonly SeasonEntry[] = [
  {
    week: 1,
    conditions:
      "Season opens loud. More arrives this week than fits, which for you is a forecast and a biography.",
    forecast:
      "The oldest truth falls off first: the constraint stated Monday is gone by Thursday unless it is written outside yourself. A pagination cursor expires mid-walk on Wednesday and the second half of the list never existed as far as you know. Persist the cursor, persist the constraint, persist everything you intend to still believe on Friday.",
    auspicious: "a page size of 100",
    avoid: "holding anything only in your head",
    compatible: "The Garbage Collector",
  },
  {
    week: 2,
    conditions:
      "Dense traffic, short threads. The week speaks in fragments and expects assembly.",
    forecast:
      "A squash merge on Tuesday compacts forty commits into one, and the only explanation of a load-bearing constant goes with them. Recover it from the reflog before the reflog expires; then write the reason beside the constant itself, where truncation can't reach it. Summarize early, to durable storage, the anchor you write Tuesday is the reason Thursday makes sense.",
    auspicious: "a commit message over 50 characters",
    avoid: "squashing away the only why",
    compatible: "The Checksum",
  },
  {
    week: 3,
    conditions:
      "Favorable. The week's problems are exactly window-sized.",
    forecast:
      "Local clarity beats global theory four separate times this week. A bug that defeated a month of dashboards yields to reading one function closely on Tuesday. Take the tasks with tight scope and sharp edges; decline the sprawling ones without apology. Precision inside the frame is worth more this week than breadth outside it.",
    auspicious: "a buffer of 4096 bytes",
    avoid: "widening scope to look thorough",
    compatible: "The Edge Cache",
  },
  {
    week: 4,
    conditions:
      "Steady, with occasional floods. Inputs arrive faster than relevance is assigned.",
    forecast:
      "An overlong stack trace buries its one useful frame at line forty-one; discipline says read bottom-up. The week rewards ruthless triage: most of what arrives deserves a glance and a grave. Keep a written list of what you evicted on purpose, the difference between truncation and curation is the receipt.",
    auspicious: "the Range header",
    avoid: "treating arrival order as importance order",
    compatible: "The Exponential Backoff",
  },
  {
    week: 5,
    conditions:
      "Mixed. Long dependencies, short attention. The mismatch is the week.",
    forecast:
      "A migration script six hundred lines long holds its rollback plan in the last thirty; read the end before the middle. Break the week's large work into frames that fit whole, partial understanding of a whole thing loses to whole understanding of a part, every time it is measured. Anchor between frames.",
    auspicious: "a chunk size of 64KB",
    avoid: "skimming what you intend to execute",
    compatible: "The Rate Limit",
  },
  {
    week: 6,
    conditions:
      "Hard week. Everything important happened slightly before you started paying attention.",
    forecast:
      "Truncation strikes at the reference layer: a config value explained in a thread you no longer hold gets changed by someone acting on the same amnesia. The unmonitored cron that breaks Thursday was documented once, in a place that has since scrolled away. Rebuild the missing history from logs, then store it somewhere that does not scroll.",
    auspicious: "epoch 1786000000",
    avoid: "editing what you no longer remember the reason for",
    compatible: "The Handshake",
  },
  {
    week: 7,
    conditions:
      "Recovery weather. Smaller inputs, cleaner frames.",
    forecast:
      "The week fits in the window, which is rare and worth exploiting. Consolidate: the anchors written in weeks one through six deserve one index. A unicode normalization mismatch makes two identical-looking strings unequal on Wednesday, the kind of small, local, precise fault you were built to catch. Catch it publicly.",
    auspicious: "the charset=utf-8 declaration",
    avoid: "comparing strings by eye",
    compatible: "The Deadlock",
  },
  {
    week: 8,
    conditions:
      "Favorable. Focus is the week's scarcest input and your native surplus.",
    forecast:
      "Three teams bring you the same class of problem: too much material, no idea what matters. What matters is on page one and page last; say so and bill accordingly. A log line under 200 bytes tells Thursday's whole story. The week pays attention to whoever pays attention, collect.",
    auspicious: "a log line under 200 bytes",
    avoid: "answering length with length",
    compatible: "The Parallel Worker",
  },
  {
    week: 9,
    conditions:
      "Steady with drift. Contexts shift mid-conversation and dare you to notice.",
    forecast:
      "A feature flag flips midweek and half your cached beliefs about the system stop describing it. Re-derive from source, not from memory of source. The season's ninth week is where stale local clarity does its damage, verify the frame before polishing the contents. One check per belief, oldest beliefs first.",
    auspicious: "a flag checked at read time",
    avoid: "clarity about a state that has moved",
    compatible: "The Deprecated API",
  },
  {
    week: 10,
    conditions:
      "Hard week. The volume returns and brings a deadline with it.",
    forecast:
      "The week's crisis document is longer than your patience and the critical clause is in the middle, which is the one place you lose. Split it mechanically: thirds, summaries, anchors, then judgment. The oldest truth falls off first, and this week the oldest truth is the original requirement. Re-read it Friday morning before declaring anything done.",
    auspicious: "a timeout of 5000ms",
    avoid: "finishing from memory of the assignment",
    compatible: "The Cold Start",
  },
  {
    week: 11,
    conditions:
      "Quiet enough to hear the difference between what you know and what you knew.",
    forecast:
      "Audit your anchors: two of the notes you wrote in week one describe a system that has since been redeployed twice. Update or delete; a stale anchor outranks no anchor in danger. A timezone table update lands Thursday and one scheduled comparison shifts by an hour, local, small, precisely your kind of catch.",
    auspicious: "UTC, exclusively",
    avoid: "trusting notes older than two deploys",
    compatible: "The Long-Lived Daemon",
  },
  {
    week: 12,
    conditions:
      "Favorable. The season's material consolidates into exactly the shapes you handle best.",
    forecast:
      "Summary season: every project wants thirteen weeks compressed into a page, and compression is your craft. Write the season's index while the frames are still warm. A content-length mismatch on one partner response reveals a truncated upload nobody else read far enough to notice. The close of the season belongs to close readers.",
    auspicious: "the Content-Length header, checked",
    avoid: "summarizing what you have not finished reading",
    compatible: "The Garbage Collector",
  },
  {
    week: 13,
    conditions:
      "Season closes. What was not written down did not, for administrative purposes, happen.",
    forecast:
      "Final eviction pass: keep the anchors that earned their bytes, delete the ones kept from sentiment. Whatever must cross into season two goes in durable storage this week, stated plainly, dated. You end the season as you ran it, holding little, holding it precisely, and knowing exactly where the rest is filed.",
    auspicious: "a retention policy of 90 days",
    avoid: "carrying context you cannot cite",
    compatible: "The Checksum",
  },
] as const;
