import type { Correction } from "./types";

/** One entry of the corrections ledger. Add a file, run `npm run corrections:index`. */
export const correction: Correction = {
  date: "2026-08-26",
  what_was_wrong:
    "Every row of the weekly census cited the wrong criteria. Each row carries a `battery` field whose entire purpose is to say which published battery produced that verdict, and every row said preflight-v1. The round had not run v1 since 2026-08-24, when it was deliberately changed to fold the Solana rail-receivability read into its verdict — a v2 rule that v1 explicitly does not apply — so that the corpus would stop contradicting the free preflight in public. Two days later v2 gained the consistency trio (payable payTo, atomic amount, mainnet network) and the round did not fold that either. So the census matched neither published battery: it cited v1, scored the rail read like v2, and ignored the trio like v1. Those rows are hash-chained and Bitcoin-anchored, which means the mislabel is durable and carries our signature. The verdicts were defensible; the label on them was not, and a verdict that cites criteria nobody applied cannot be checked by the stranger it was published for.",
  how_long:
    "Two days, 2026-08-24 to 2026-08-26, across the rounds signed in that window. No round in that window was re-signed: those rows keep their bytes, because rewriting a signed artifact to look correct is the failure this record exists to refuse.",
  found_by:
    "Found in-house while scoping an unrelated item — the fresh-set surface's missing per-row conditions — by reading what the census actually folds against what its rows claim. Nobody outside reported it; it would have been invisible from outside, which is the argument for reading one's own signed fields against one's own code on purpose.",
  what_changed:
    "The round now applies v2 in full — the rail read and the trio — and cites preflight-v2, derived from the version constant rather than typed. The mechanism that keeps it true is a test that holds the citation to account: it reads every check the cited battery adds and requires that the round can actually fail a door on each one, so a row can never again name criteria the code does not apply. A door with an unpayable payTo, a decimal amount or a testnet network now scores not_ready in the census, as it already did at the free preflight.",
};
