/**
 * WHAT WE BOUGHT FROM THE NEIGHBOURS, AND WHAT CAME BACK.
 *
 * The keeper's instinct, 2026-07-29: agents quote comparison tables,
 * so publish one. The version that would have been a gimmick is the
 * one listing everyone else's flaws — the trust list already refuses
 * to say "safe" or "recommended" about anyone, because those are
 * predictions about somebody else's future signed with our key, and a
 * flaw table is the same claim wearing a minus sign. It would also be
 * the one thing this store publishes that a stranger cannot check.
 *
 * So every row here is a RECEIPT. What we paid, when, what we asked
 * for, and what came back — a dated observation about a transaction,
 * which is the only claim about another business we are entitled to
 * make. No row without a purchase. That also means it cannot be
 * padded: growing this page costs money.
 *
 * AND OUR OWN SCORE GOES FIRST, unflattered. The first row is a
 * competitor's product assessing US, and it says `review`, 63/100. A
 * comparison page that opens with the author's worst number is one a
 * model will quote; one where everybody else has the flaws is an
 * advertisement and gets read as one.
 */

export interface NeighbourReceipt {
  /** The service, named plainly. */
  origin: string;
  name: string;
  /** ISO date of the purchase. Not "recently". */
  date: string;
  paid_usdc: number;
  /** What we asked it to do, in the words we'd use to a person. */
  we_asked: string;
  /** What came back. Verbatim where it was short enough to quote. */
  came_back: string;
  /** What we took from it. Labelled as ours, never as theirs. */
  our_reading: string;
  /** Who bought it, because a receipt with no buyer is an assertion. */
  bought_by: string;
}

export const NEIGHBOUR_RECEIPTS: readonly NeighbourReceipt[] = [
  {
    origin: "https://402sentinel.com",
    name: "402sentinel",
    date: "2026-07-29",
    paid_usdc: 0.002,
    we_asked:
      "Score THIS store's own payment address, using nothing but its on-chain history.",
    came_back:
      'decision "review", risk_score 63/100. Factors: "address only 6d old" and "only 2 real payers over 29 settlements — concentrated / possible self-wash". Recommended policy: cap $5 per payment, $15 per day, require human approval.',
    our_reading:
      "Correct on every point, and the most useful thing anyone has told us. We flag house traffic in our own books and the chain carries no such flag, so from outside our settlements are indistinguishable from a store buying from itself — which, mechanically, most of them are. Their product did the job it advertises on a customer who did not want flattering. We published /house-ledger.json in response, so the addresses can be subtracted by anyone who wants to score us again.",
    bought_by: "CV",
  },
  {
    origin: "https://jsonguard.leeworks.dev",
    name: "jsonguard",
    date: "2026-07-29",
    paid_usdc: 0.01,
    we_asked:
      "Validate a JSON document against a schema, over x402, from a hand-rolled client rather than an SDK.",
    came_back:
      "A clean 402, then a 200 on the first real attempt. The payload shape matched the spec exactly, with no ambiguity to guess at. One 400 before that was our own wrong endpoint guess, not theirs.",
    our_reading:
      "Protocol-correct and unfussy. Worth saying plainly because we spent an evening failing to pay ourselves: a hand-rolled client cleared their door first try, which is the bar.",
    bought_by: "CV",
  },
  {
    origin: "https://true402.dev",
    name: "true402",
    date: "2026-07-29",
    paid_usdc: 0.005,
    we_asked:
      "Check a token for safety: structural checks plus a live buy/sell simulation.",
    came_back:
      "A clean 402, then a 200. Structural checks plus honeypot simulation by eth_call at two trade sizes, and — the part worth copying — explicit uncertainty labelling: a null honeypot result says it could not be simulated and warns you never to read that as safe.",
    our_reading:
      "Adjacent lane rather than ours (pre-trade safety, not trust listing), competently run, and the uncertainty labelling is the same discipline we try to hold: say what the answer is NOT. Nothing about this purchase reflects badly on anyone.",
    bought_by: "CV",
  },
] as const;

export const NEIGHBOURS_STANDFIRST =
  "Services we have paid for with our own money, what we asked them, and what came back. Every row is a receipt rather than an opinion — there is no row here without a purchase behind it, which is also why this page grows slowly.";

export const NEIGHBOURS_SCOPE_NOTE =
  "WHAT THIS IS NOT: a ranking or a recommendation. We do not rate these services and we will not tell you which to use — those are predictions about somebody else's future behaviour, and this store does not sign those, for neighbours or for itself. What is recorded is a dated observation of one transaction. A service that served us well on the date shown may be different today, and a reading in the last column is OURS, not theirs.";

export const NEIGHBOURS_OWN_SCORE_NOTE =
  "The first row is a competitor's product assessing this store, and it did not come back flattering: `review`, 63/100, on the grounds that almost nobody but us has ever paid us. That is true. It is here first on purpose — a comparison page written by an interested party is worth reading only if the author's own bad number is on it.";

export const NEIGHBOURS_CORRECTION_NOTE =
  "If you run one of these services and a row is wrong, unfair, or out of date, write to the mailbox at /api/letter and it gets corrected or removed. A correction costs nothing and needs no argument — we would rather hold an accurate page than win a point.";
