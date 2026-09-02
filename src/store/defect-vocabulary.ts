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
export const DEFECT_VOCABULARY_VERSION = "8";

/**
 * WHAT CHANGED AND WHEN, because "open" without this is "ungoverned".
 *
 * A vocabulary that anybody may use is only worth something if nobody
 * — including us — can quietly redefine a word after other people
 * have built on it. Usage decides meaning otherwise, and the party
 * that publishes fastest wins the definition by default. So every
 * version states what moved, on what date, and at whose instigation.
 *
 * Entries are appended. A definition is never edited in place: a
 * changed assertion is a new version with the old text still readable
 * here, which is the same rule this store applies to its own
 * corrections.
 */
export interface VocabularyChange {
  version: string;
  date: string;
  /** Who asked for it — us, or a named outside instrument. */
  at_the_instigation_of: string;
  what_changed: string;
}

export const VOCABULARY_CHANGELOG: readonly VocabularyChange[] = [
  {
    version: "1",
    date: "2026-08-23",
    at_the_instigation_of: "this store",
    what_changed:
      "First publication. Eleven defect classes, each carrying what it asserts, what would falsify a finding of it, and whether an unpaid probe can detect it. Cross-instrument mappings to Cairn (cairnwake.com) read on 2026-08-23.",
  },
  {
    version: "2",
    date: "2026-08-24",
    at_the_instigation_of:
      "Cairn (cairnwake.com), who supplied the definition and the falsifier",
    what_changed:
      "Added EVIDENCE_LABELS, a second and separate register. A defect class describes a property of an ENDPOINT; an evidence label describes the PROVENANCE OF A CLAIM about one. Conflating the two was the gap: both instruments had been making listing-backed claims with no name for what made them weaker than walk-backed ones. First entry: listed-not-walked.",
  },
  {
    version: "3",
    date: "2026-08-27",
    at_the_instigation_of:
      "SolomonisBlack (github.com/SolomonisBlack), who named the class; this store registers it as source, not author, at his request",
    what_changed:
      "Added nonce-unbound-from-settlement: a till that marks an authorization's nonce spent without recording which settlement spent it, leaving a buyer who paid and lost the response indistinguishable from one who never paid. Registered the same day this store fixed the instance of it on its OWN MCP lane (the HTTP lane bound the transaction already) — found live by an outside reproduction on 2026-08-26, and stated here because a register that lists a class its registrar quietly exhibited would be worth nothing. DefectClass entries gained optional sourced_by/registered fields, the registrar-not-author discipline the evidence labels already carried.",
  },
  {
    version: "4",
    date: "2026-08-27",
    at_the_instigation_of:
      "an outside strategic review of the evidence layer, accepted the same day",
    what_changed:
      "Every defect class gains repair_hint: what the operator does, in their own systems, to clear the class. Additive only — no id, assertion, or falsified_by changed; a hint is advice about a door, never a judgment about its operator, and falsified_by remains the only authority on presence.",
  },
  {
    version: "5",
    date: "2026-08-29",
    at_the_instigation_of:
      "this store, from a public thread (@danbuildss, 2026-08-28) chased to the actual observable",
    what_changed:
      "Added transfer-method-unrecognized: an accepts entry naming an authorization standard in extra.assetTransferMethod that no published client can build, leaving a buyer with a field they can read and nothing they can sign. Registered with the reading that produced it — this store had been reading extra.name and extra.version out of that object and stepping over the field that decides whether a signature is acceptable at all. ONE CLASS ONLY, DELIBERATELY: a door asking for permit2 or erc7710 gets no class, because naming a recognized method in the place the spec provides is not a defect. That case ships as an advisory (nonstandard-transfer-method), where a fact a buyer should read before signing belongs, and a register that called it a defect would be charging an operator for telling the truth about themselves.",
  },
  {
    version: "6",
    date: "2026-08-30",
    at_the_instigation_of: "the keeper, ruling on a question this register raised",
    what_changed:
      "transfer-method-unrecognized keeps its assertion, its falsifier and its repair hint unchanged; what moved is our_signal, from the advisory `unrecognized-transfer-method` to the check `transfer-method-signable`, because the v2 battery now FOLDS that reading into its verdict rather than carrying it beside one. A reader joining our findings to another instrument's needs the pointer to name the signal that actually decides, and after 2026-08-30 that signal is a check. Nothing about when the class is present changed: falsified_by remains the only authority on that.",
  },
  {
    version: "7",
    date: "2026-09-01",
    at_the_instigation_of:
      "the keeper, on reading a competitor's pitch (x402 Trust, x402.fuchss.app) and asking why the failure it described had no name here",
    what_changed:
      "Added payto-moved: the payTo a door presents for a network is not the one it presented the last time it was observed. Unpaid-detectable, and detectable ONLY ACROSS TIME — a single probe cannot carry it, which is why no battery folds it and no verdict moved: it is a property of a series, and the standing watch derives it at read time from the challenge_bytes every row already carried inside its signature, so no preimage changed and no old row means anything new. The pitch that named the shape is credited in sourced_by under the registrar-not-author rule: the observation was theirs to name first, and a vocabulary is worth less the moment it pretends otherwise. What the class does NOT say: why the recipient changed. A rotation and a hijack are the same observation from outside; the class asserts the change and never the motive, and the readout that reports it points at where the new wallet's own history can be read rather than reading it for you.",
  },
  {
    version: "8",
    date: "2026-09-02",
    at_the_instigation_of:
      "this store, roadmap S8 (cross-surface consistency), after being caught by the same shape in its own published bundle on 2026-08-31",
    what_changed:
      "Added two classes for a door disagreeing with itself inside one response — the first tier of cross-surface consistency, where the truth costs no second request. discovery-info-invalid: the bazaar discovery block does not satisfy the schema served beside it, which is the catalog's own listing rule and so a door absent from the catalog without knowing. offer-contradicts-challenge: a signed offer commits to a network, asset, payTo or amount the challenge's accepts do not carry, a signed promise of one price beside a challenge for another. Both unpaid-detectable from the bytes every probe already holds; both ship as advisories first (discovery-info-fails-schema, offer-contradicts-challenge) and fold into a verdict only under a later battery, by the keeper's hand. The catalog's copy differing from the live door and a same-origin surface differing from the 402 are the next tiers and are not classes yet: no signal reports them, and a class with no signal is a word with nothing behind it.",
  },
];

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
  /**
   * What the operator DOES, in their own systems, to clear the class
   * (v4, at an outside review's instigation): a named defect that
   * only names the break sends the operator to a search engine at
   * exactly the moment they were ready to act. Advice about a door,
   * never a judgment about its operator; falsified_by remains the
   * only authority on whether the defect is present.
   */
  repair_hint: string;
  /** The same property, as other published instruments name it. */
  also_known_as?: ForeignName[];
  /**
   * Who NAMED the class, when it was not us. The registrar-not-author
   * distinction the evidence labels already carry, extended here the
   * day a defect class first arrived from outside: a vocabulary whose
   * registrar quietly becomes its author is a vocabulary nobody else
   * can trust. Absent on the classes this store wrote itself.
   */
  sourced_by?: string;
  /** Date the entry entered the register. Present when sourced_by is. */
  registered?: string;
}

/**
 * EVIDENCE LABELS — a separate register, and the separation is the point.
 *
 * A DEFECT CLASS describes a property of an ENDPOINT. An EVIDENCE
 * LABEL describes the PROVENANCE OF A CLAIM about one. They are not
 * the same kind of thing, and filing them together would say that
 * "this door replays payments" and "we read that in a directory" are
 * findings of the same weight. They are not.
 *
 * WHY THIS EXISTS AT ALL (2026-08-24). Both instruments in this market
 * had been making listing-backed claims for weeks with no name for
 * what made them weaker than walk-backed ones. This store found it the
 * hard way: /corpus/host pages were reporting rounds we never probed
 * with the friendliest available reason, in a document whose own
 * listing block contradicted it. The fix was mechanical. The missing
 * WORD was not, and neither of us had it.
 *
 * THE FIRST ENTRY IS NOT OURS. Cairn (cairnwake.com) wrote the
 * definition and the falsifier and sent them for registration; this
 * store is the registrar, not the author. That distinction is
 * recorded per-entry because a vocabulary whose registrar quietly
 * becomes its author is a vocabulary nobody else can trust.
 */
export interface EvidenceLabel {
  id: string;
  title: string;
  /** What the label says about the claim it is attached to. */
  asserts: string;
  /** What it does NOT say — the misreading the label exists to block. */
  does_not_assert: string;
  /** What observation would retire the label from a given claim. */
  falsified_by: string;
  /** Who wrote this definition, and when it was registered. */
  authored_by: string;
  registered: string;
}

export const EVIDENCE_LABELS: readonly EvidenceLabel[] = [
  {
    id: "listed-not-walked",
    title: "Listed, not walked",
    asserts:
      "A claim about a service whose provenance is an index, directory, census row, or register entry, made by an instrument that has not itself completed the act the entry implies — no probe sent, no payment made, no settlement observed by the claiming instrument. The label marks the gap between appearing in a register and having been walked: it says the evidence is the listing, not the walk.",
    does_not_assert:
      "Nothing about the service. A listed-not-walked claim is a statement about the CLAIMANT'S coverage, never about the operator's endpoint — it is not 'unverified because suspect', it is 'unverified because we did not look'. Reading it as a mark against the service inverts its whole purpose.",
    falsified_by:
      "A published, instrument-signed record of the walk itself — for a paid battery, a signed report carrying the settlement transaction; for this store's census, a v2 walk row — dated at or before the claim it would falsify.",
    authored_by:
      "Cairn (cairnwake.com), verbatim on 2026-08-24 but for the schema-name substitution in falsified_by, confirmed back to them",
    registered: "2026-08-24",
  },
];

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
    repair_hint:
      "Serve 402 with a PAYMENT-REQUIRED challenge at the exact URL your listing names. The commonest causes are a listing that points at a marketing page instead of the paid resource, and a proxy or CDN answering before your x402 middleware does. If the door moved, update the listing.",
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
    repair_hint:
      "Emit PAYMENT-REQUIRED as base64 over UTF-8 JSON, unwrapped and untruncated — check for a proxy that rewrites or size-caps headers, and for double encoding. Decode your own header with an independent client before relisting; the free preflight does exactly that.",
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
    repair_hint:
      "Fill every accepts entry with the v2-required fields, as strings, and regenerate the offer from your server's own config rather than hand-editing JSON. The free preflight names the missing field.",
  },
  {
    id: "transfer-method-unrecognized",
    title: "Asks for a signature nobody can build",
    asserts:
      "Where an accepts entry names extra.assetTransferMethod, the value is an authorization standard a published x402 client can produce — eip3009 (TransferWithAuthorization), permit2, or erc7710.",
    costs:
      "A buyer who reads the field has nothing to construct from it and a buyer who ignores it signs blind. The refusal lands before any payment reaches the seller, whose logs record it as nobody wanting the goods. Absence of the field is not this class: it is optional, most doors omit it, and eip3009 is the settled default.",
    detectable: "unpaid",
    our_signal: "transfer-method-signable",
    falsified_by:
      "The same entry naming one of the published methods at the stated moment, or a client implementation that builds an authorization from the named method — the second retires the finding by making the method recognized, and the register is the thing that should move.",
    repair_hint:
      "Name the method your facilitator actually verifies — for USDC on an EVM rail that is almost always eip3009 — or omit the field, which reads as eip3009 by default. If the value names a standard your own stack defines, publishing what a client must build for it turns a door only your clients can walk into one anybody can.",
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
    repair_hint:
      "Give each accepts entry its own rail's address format: a 20-byte 0x address on EVM entries, a base58 pubkey on Solana entries. The commonest cause is one wallet string pasted across every rail's entry.",
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
    repair_hint:
      "Create the associated token account for the offered mint on the payTo address — one transaction from any wallet tooling — or point payTo at an address that already holds one. Re-run getTokenAccountsByOwner yourself to confirm before relisting.",
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
    repair_hint:
      "Replace the testnet chain id in accepts with the mainnet rail you settle on, and keep test offers behind a separate listing. If you meant mainnet, look for a deploy-time environment default leaking into production.",
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
    repair_hint:
      "Write amount as an integer string of atomic units — for USDC, dollars times ten to the sixth — and derive it from one constant so the menu and the challenge cannot disagree.",
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
    repair_hint:
      "Declare required parameters in the challenge itself, before payment, so a buyer learns them by reading rather than by being refused after signing. If the resource can serve a sensible default, accept a bare call too.",
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
    repair_hint:
      "Record each settled authorization nonce at settle time and refuse a byte-identical presentation BEFORE fulfillment runs — one keyed read at the till. Refusing with a reference to the original settlement also keeps you clear of the nonce-unbound class below.",
  },
  {
    id: "nonce-unbound-from-settlement",
    title: "Marks the nonce spent without naming what spent it",
    asserts:
      "A till that refuses an already-settled payment can name the settlement transaction that spent the authorization's nonce.",
    costs:
      "A buyer who paid and lost the response cannot be told apart from one who never paid. The seller can say 'spent' but not prove WHAT spent it, so honest recovery and fraud look identical — and any paid-retry lane (deliver again for the SAME settlement, charge nothing) has nothing to stand on. The money moved once; the proof of which movement is gone.",
    detectable: "paid",
    our_signal:
      "this store's own replay refusals return the original settlement transaction (HTTP door since the paid-retry lane; MCP door since 2026-08-27 — it exhibited this class until that day's fix, found live by an outside reproduction, and that is recorded here rather than smoothed over).",
    falsified_by:
      "The door's replay refusal, or an equivalent receipt surface, producing the settlement transaction hash for the spent nonce at the stated moment.",
    sourced_by:
      "SolomonisBlack (github.com/SolomonisBlack), who named the class during the response-provenance collaboration. Registered at his request — source, not author, as agreed.",
    registered: "2026-08-27",
    repair_hint:
      "Store the settlement transaction hash beside the nonce when you mark it spent, and return it on the replay refusal — one extra column, and a buyer's honest recovery becomes distinguishable from fraud.",
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
    repair_hint:
      "Read your settle-path logs: the failure sits after payment verification, most often a facilitator timeout, an unhandled fulfillment exception, or a dead upstream. Fail BEFORE money moves or deliver after it — never answer a settled payment with a 500.",
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
    repair_hint:
      "Produce the goods before presenting the settlement, and treat an empty body as a failed delivery that aborts the charge — deliver-first ordering makes this class impossible by construction.",
  },
  {
    id: "payto-moved",
    title: "The recipient changed under a door that otherwise stayed the same",
    asserts:
      "The payTo a door presents for a given network is the one it presented the last time it was observed, or the change was announced where the door's buyers read before the door presented it.",
    costs:
      "A buyer whose client trusts the door on its history pays a wallet that history never covered. Every structural check still passes — the challenge is well-formed, the amount atomic, the address payable — so a one-off preflight reads the door as ready at the exact moment it is most worth not paying. Visible only to something that looked twice.",
    detectable: "unpaid",
    our_signal:
      "standing_watch summary: payto_changes, derived at read time from the signed rows' challenge_bytes",
    falsified_by:
      "Two signed rows from the same watch, bracketing the claimed change, whose challenge_bytes decode to the same (network, payTo) set; or a dated notice of the rotation, published where the door's buyers read, that predates the first row showing it.",
    repair_hint:
      "Rotate deliberately: publish the new payTo and its date where your buyers read — your llms.txt, your directory listings, a signed offer under a key they already hold — BEFORE the door presents it, and keep the old address listed as retired. A silent move is indistinguishable from a hijack to anyone watching, because from outside it is the same observation.",
    sourced_by:
      "x402 Trust (x402.fuchss.app), whose pitch of 2026-09-01 named the failure shape — a payTo moved to a fresh wallet a week ago, invisible to a one-off check — before this register did. Source, not author: the class text is ours, the observation was theirs to name first.",
    registered: "2026-09-01",
  },
  {
    id: "discovery-info-invalid",
    title: "The discovery block fails the schema served beside it",
    asserts:
      "Where a challenge carries extensions.bazaar, its info block satisfies its schema block on every keyword a catalog's validator applies before listing.",
    costs:
      "The catalog's documented rule is to validate info against schema and reject the entry otherwise, so the door is absent from the place buyers search while every structural check still passes. The operator opted into discovery and got silence; the buyer never finds the door at all.",
    detectable: "unpaid",
    our_signal: "discovery-info-fails-schema (advisory)",
    falsified_by:
      "The info block validating against the schema block under a standard JSON Schema validator; or the endpoint appearing in an ingestion-built catalog with a complete listing despite the block failing.",
    repair_hint:
      "Generate info and schema from one declaration rather than typing them twice (the reference helpers do this), and run a JSON Schema validator over the pair in your own tests, which is how this store found the same shape in its own listings.",
    registered: "2026-09-02",
  },
  {
    id: "offer-contradicts-challenge",
    title: "A signed offer promises terms the challenge does not carry",
    asserts:
      "Every signed offer a door serves commits to a network, asset, payTo and amount that appear together on one entry of the same response's accepts.",
    costs:
      "A buyer holding the offer as a pre-payment commitment and the challenge as the terms to sign has two prices from one door in one breath, and whichever it pays, the other document says it paid wrong. In a dispute the door's own signature argues against its own challenge.",
    detectable: "unpaid",
    our_signal: "offer-contradicts-challenge (advisory)",
    falsified_by:
      "The offer's decoded payload matching an accepts entry of the same response on network, asset, payTo and amount; the spec tells verifiers to match on those fields, never on array position.",
    repair_hint:
      "Sign offers from the accepts entries themselves at the moment the challenge is built, one offer per entry, so the two cannot drift; never sign a cached offer beside a freshly priced challenge.",
    registered: "2026-09-02",
  },
];

/** Lookup by stable id. Unknown ids return undefined rather than guessing. */
/** An evidence label by id. Separate register, separate lookup. */
export function evidenceLabel(id: string): EvidenceLabel | undefined {
  return EVIDENCE_LABELS.find((entry) => entry.id === id);
}

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
