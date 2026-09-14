import type { Correction } from "./types";

export const correction: Correction = {
  date: "2026-09-13",
  what_was_wrong:
    "The preamble of /llms.txt — the store's own front door for agents — told every reader that /llms-full.txt \"serves this SAME document, byte for byte\", that ours \"has always been complete\", that the alias existed only to spare a blind crawler a 404, and that it \"is not a fuller copy and this file will not pretend otherwise\". All of that was true when it was written and none of it was true when it was read. The index/full split shipped afterwards: /llms.txt became a 30,000-character map and /llms-full.txt the 159,000-character guide it maps. A reader who believed the sentence had no reason to fetch the full document, which is the only place most of this store is described — so the false claim cost exactly the readers it was written to help.",
  how_long:
    "From the day the index and the full guide became different documents until 2026-09-13. The split's own commit is the start; no earlier bound is claimed.",
  found_by:
    "The keeper's ask to put the Paywall on the storefront and name the release wheel across the client-facing surfaces. Naming one more door pushed the index six characters past the convention's budget, and the paragraph read while hunting for characters to trim was this one.",
  what_changed:
    "The sentence now says what is true: /llms-full.txt is the complete prose this file maps, and this file is the index. The mechanism is a guard, not care — test/llms-modular.spec.ts asserts the served index does not contain \"SAME document\" or \"byte for byte\" and does contain the true sentence, in the same file as the older byte-equality test that had been silently contradicting the prose for a fortnight. The two guards now disagree loudly instead of quietly: one reads the bytes, the other reads the sentence about the bytes. Nothing else in the guide changed meaning, and the correction bought 85 characters, which is what paid for the new door.",
};
