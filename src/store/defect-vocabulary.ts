/**
 * NAMED DEFECTS, SO TWO INSTRUMENTS CAN MEAN THE SAME THING.
 *
 * On 2026-08-23 there were two parties publishing dated conformance
 * findings about the public x402 economy: this store's weekly census,
 * and an independent tester (Cairn, cairnwake.com) walking the same
 * Coinbase directory. Both signed their results. Both refused to audit
 * themselves. And neither could read the other's, because a finding
 * called `replay-accepted` over there and a stage called `replay` over
 * here were two names with no stated relationship.
 *
 * That is the ordinary condition of a pre-standard market, and it is
 * the condition an observatory exists to end. A vocabulary is worth
 * less than the observations it labels — and the observations are
 * worth much less without it, because nobody can join them up.
 *
 * WHAT EACH ENTRY MUST CARRY, and the rule is borrowed openly from
 * Cairn's own wake-124 evidence discipline: every claim ships with a
 * path a reader can walk without trusting the claimant, or an explicit
 * label saying it rests on inference and what would falsify it. So a
 * defect class here states what it ASSERTS, what would FALSIFY a
 * finding of it, and — the part that actually matters for comparing
 * instruments — whether it is detectable WITHOUT PAYING.
 *
 * THE METHOD FIELD IS THE INTEROP. Our census sends one unpaid GET; a
 * paid walk settles real money. A door can be clean to us and defective
 * to them with neither instrument wrong, because we cannot see what
 * only money reveals. Publishing which side of that line each defect
 * falls on is what turns "we disagree" into "we measured different
 * things", and it is the single most useful thing this file does.
 *
 * NOT A SCORE, AND NEVER A RANKING. Every entry describes an
 * OBSERVABLE PROPERTY OF ONE ENDPOINT AT ONE MOMENT. Nothing here
 * accumulates across weeks into a judgment on an operator; rule 43
 * survives contact with a taxonomy or the taxonomy goes.
 */

/** Bumped when a class is added, retired, or its assertion changes. */
export const DEFECT_VOCABULARY_VERSION = "1";

/** The date this file's cross-instrument mappings were last verified. */
export const MAPPINGS_READ_ON = "2026-08-23";

export interface ForeignName {
  /** The instrument that publishes it. */
  instrument: string;
  /** Their identifier for the same observable property. */
  as: string;
  /** How a reader checks this mapping without trusting us. */
  verify: string;
  /** What would show the mapping is wrong. */
  falsified_by: string;
}

export interface DefectClass {
  /** Stable. Never reused for a different meaning; retired, not renamed. */
  id: string;
  title: string;
  /** What must hold for a door to be clear of this defect. */
  asserts: string;
  /** What a buyer loses when it is present. */
  costs: string;
  /**
   * "unpaid" — visible from a GET nobody paid for.
   * "paid" — only a settled payment reveals it.
   * The line two instruments must both publish to be comparable.
   */
  detectable: "unpaid" | "paid";
  /** The check or stage in this store that reports it, when one does. */
  our_signal: string | null;
  /** What observation would disprove a finding of this class. */
  falsified_by: string;
  /** The same property, as other published instruments name it. */
  also_known_as?: ForeignName[];
}

const CAIRN_SCOREBOARD =
  "cairnwake.com/scoreboard.json, read 2026-08-23: a public machine-readable rollup of its published reports";

export const DEFECT_CLASSES: readonly DefectClass[] = [
  {
    id: "no-402",
    title: "Listed, but serves no payment challenge",
    asserts:
      "The URL a directory lists answers 402 Payment Required to an unpaid GET.",
    costs:
      "Every buyer routed here finds no challenge at all. The listing is an advertisement for a door that does not open.",
    detectable: "unpaid",
    our_signal: "status-402",
    falsified_by:
      "The same URL answering 402 with a parseable challenge to an unauthenticated GET at the stated moment. A 402 that appears only for some callers is a different finding, not this one.",
  },
  {
    id: "unparseable-challenge",
    title: "Challenge cannot be read by a client",
    asserts:
      "The PAYMENT-REQUIRED header is present and is base64-encoded JSON a v2 client can parse.",
    costs:
      "Surfaces to the buyer as 'invalid payment header format' or a silent parse failure. The seller sees nothing.",
    detectable: "unpaid",
    our_signal: "payment-required-header",
    falsified_by:
      "The header decoding to valid JSON by any conforming base64 + JSON reader at the stated moment.",
  },
  {
    id: "unsignable-offer",
    title: "Offer a buyer cannot sign against",
    asserts:
      "Every accepts entry carries the fields a client needs to construct a payment, as strings.",
    costs:
      "A buyer reaches the signing step and has nothing to sign. Indistinguishable, from the seller's logs, from nobody wanting the goods.",
    detectable: "unpaid",
    our_signal: "accepts",
    falsified_by:
      "Every accepts entry carrying the published required fields at the stated moment.",
  },
  {
    id: "unpayable-payto",
    title: "payTo is not the bytes a payment signs over",
    asserts:
      "payTo is a 20-byte 0x address on an EVM rail, or a base58 pubkey on Solana — not a name, and not a wallet pasted into the wrong rail's entry.",
    costs:
      "Most clients throw inside their signing library. The seller never learns a buyer came.",
    detectable: "unpaid",
    our_signal: "accepts",
    falsified_by:
      "The payTo parsing as a valid address for the rail its own entry names.",
  },
  {
    id: "rail-cannot-receive",
    title: "The address cannot be credited in the mint it asked for",
    asserts:
      "On Solana, the payTo owns an associated token account for the offered mint, so a transfer has somewhere to land.",
    costs:
      "The payment fails in simulation before it can broadcast. Every structural check passes and nobody can pay.",
    detectable: "unpaid",
    our_signal: "solana-rail-receivable",
    falsified_by:
      "getTokenAccountsByOwner returning at least one account for that owner and mint. Anyone can repeat the read; it is public and unpaid.",
    also_known_as: [
      {
        instrument: "Cairn (cairnwake.com)",
        as: "rail-cannot-receive",
        verify: CAIRN_SCOREBOARD,
        falsified_by:
          "Their published definition describing a different observable property than the one asserted here.",
      },
    ],
  },
  {
    id: "wrong-network",
    title: "Offered on a network the buyer is not on",
    asserts:
      "The accepts entries name the mainnet rail a buyer is expected to pay from.",
    costs:
      "A client attaches payment and keeps getting 402. The commonest cause is a testnet left in the offer.",
    detectable: "unpaid",
    our_signal: "testnet-network",
    falsified_by:
      "The entry naming a mainnet chain id the buyer's client supports.",
  },
  {
    id: "amount-not-atomic",
    title: "Price written in dollars where atomic units are required",
    asserts:
      "accepts amounts are integer atomic units (USDC has six decimals).",
    costs:
      "A decimal point usually means the price is off by a factor of a million, in one direction or the other.",
    detectable: "unpaid",
    our_signal: "amount-not-atomic",
    falsified_by: "The amount parsing as an integer string.",
  },
  {
    id: "inputs-undeclared",
    title: "Required parameters a buyer discovers only by being refused",
    asserts:
      "A resource needing parameters declares them in the challenge, before payment.",
    costs:
      "The buyer is refused AFTER signing, and their ledger records that as this endpoint failing. The largest single cause of refused purchases at otherwise-working endpoints in the August 2026 field run.",
    detectable: "unpaid",
    our_signal: "no-input-contract",
    falsified_by:
      "A declared input contract in the challenge, or the resource succeeding with no parameters.",
  },
  {
    id: "replay-accepted",
    title: "Serves the goods twice for one settled payment",
    asserts:
      "A byte-identical, already-settled payment presented a second time is refused.",
    costs:
      "The seller gives its product away. The authorization's nonce is spent, so nothing reaches them on the second pass — and from their side both requests look like successful sales.",
    detectable: "paid",
    our_signal: "launch_check stage: replay",
    falsified_by:
      "The endpoint refusing the identical presented payment on the second attempt at the stated moment.",
    also_known_as: [
      {
        instrument: "Cairn (cairnwake.com)",
        as: "replay-accepted / check replay_rejected",
        verify: CAIRN_SCOREBOARD,
        falsified_by:
          "Their check asserting something other than the refusal of an identical already-settled payment.",
      },
    ],
  },
  {
    id: "settlement-error",
    title: "A correct payment is answered with a server error",
    asserts:
      "A valid, sufficient payment is answered with a 2xx and the goods.",
    costs:
      "Money may move with nothing delivered. The failure is invisible to the free preflight, which never pays.",
    detectable: "paid",
    our_signal: "launch_check stage: settle",
    falsified_by:
      "A correctly-formed payment settling and returning a 2xx at the stated moment.",
    also_known_as: [
      {
        instrument: "Cairn (cairnwake.com)",
        as: "settlement-server-error",
        verify: CAIRN_SCOREBOARD,
        falsified_by:
          "Their class covering refusals of INVALID payments, which is conformant behaviour and not this defect.",
      },
    ],
  },
  {
    id: "delivered-nothing",
    title: "Settled, and the buyer is left holding nothing",
    asserts:
      "A settled payment returns a non-empty body.",
    costs:
      "Money moved for zero bytes. Distinct from a settlement error, because the endpoint reports success.",
    detectable: "paid",
    our_signal: "launch_check stage: delivery",
    falsified_by: "A non-empty response body accompanying the 2xx.",
  },
];

/** Lookup by stable id. Unknown ids return undefined rather than guessing. */
export function defectClass(id: string): DefectClass | undefined {
  return DEFECT_CLASSES.find((entry) => entry.id === id);
}

/** The classes an unpaid probe can reach — what a free check can honestly claim. */
export function unpaidDetectable(): DefectClass[] {
  return DEFECT_CLASSES.filter((entry) => entry.detectable === "unpaid");
}

/** The classes only a settled payment reveals. */
export function paidOnly(): DefectClass[] {
  return DEFECT_CLASSES.filter((entry) => entry.detectable === "paid");
}
