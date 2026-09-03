/**
 * WHAT THIS STORE SIGNS, WHO HOLDS THE KEY, AND WHOSE WORD YOU ARE
 * ACTUALLY TAKING.
 *
 * Written 2026-07-30 in answer to an outside critique that landed
 * mostly right: "no disclosed key architecture, no spec, no
 * interoperability story — a proof-of-concept sketch, not
 * infrastructure." Three of its specific claims were already false
 * (the key hangs at /.well-known, the listing spec is published and
 * CI-validated, and /api/verify serves the exact signed bytes), and
 * the fact that a reader could believe all three IS THE FINDING. If
 * the machinery exists and nobody can tell, it may as well not.
 *
 * THE CRITIQUE'S SHARPEST POINT IS CONCEDED IN FULL. It distinguished
 * in-process signing from operator-deployed mediator signing from
 * independent third-party witness signing, and observed that a store
 * selling small signed goods does not address which of those it is.
 * It didn't. This file is that, stated per artifact class rather than
 * claimed in general, including the classes where the honest answer is
 * "the weakest one."
 *
 * WE DO NOT CLAIM RIGOR WE DO NOT HAVE. There is no hash-linked
 * continuity chain here, no offline evidence bundle format, no key
 * rotation, no threshold signing, no HSM, and no patent. Every one of
 * those absences is listed below in its own words rather than left for
 * somebody to discover and write a post about.
 *
 * THE POINT IS NOT TO LOOK SERIOUS. It is that a buyer can work out,
 * without asking us, exactly how much a given signature is worth — and
 * for several classes the honest answer is "it proves we said this on
 * this date, and nothing more."
 */
import { CERT_FIELDS } from "@/lib/signing";
import { KEY_BACKUP_EXISTS } from "@/store/key-continuity";
import { RETIRED_KEYS } from "@/store/key-registry";

/**
 * Who you are trusting when a signature checks out. Ordered weakest to
 * strongest, deliberately, so the list cannot be read as a ranking of
 * how good our items are.
 */
export type TrustModel =
  | "self_signed"
  | "custody_only"
  | "third_party_observation";

export const TRUST_MODELS: Record<
  TrustModel,
  { name: string; means: string; weakness: string }
> = {
  self_signed: {
    name: "Self-signed (in-process)",
    means:
      "The store signs a statement about itself or about a transaction with itself, with its own key, in the same process that produced the statement. A valid signature proves the bytes came from this store's key and have not changed since. It proves nothing about whether the statement is true.",
    weakness:
      "This is the weakest trust model there is. If you do not trust the store, a self-signed certificate gives you no reason to start. It is a receipt, not evidence.",
  },
  custody_only: {
    name: "Custody and timestamp only",
    means:
      "The content was written by the buyer, not by us. The signature attests that this store received exactly these bytes and filed them at this time. It is a notarised envelope: the envelope is ours, the letter is yours.",
    weakness:
      "We do not check, endorse, or vouch for anything inside. A signed anchor summary can be entirely false and the signature is still valid, because the signature was never a claim about the contents.",
  },
  third_party_observation: {
    name: "Third-party observation",
    means:
      "The store observes something it does not control and signs what it saw: public chain state on Base, Polygon, or Solana, or whether somebody else's URL answered when we walked past it out of band. We are not a party to the thing being observed, which is the property that makes the observation worth anything.",
    weakness:
      "It is still OUR observation, made once, at one moment, by one party. It is not a consensus, not a monitoring history, and not a promise about any other moment. A NOT_FOUND is not a claim that something will never settle.",
  },
};

export interface ArtifactClass {
  /** What it is called on the artifact and in the URL. */
  id: string;
  name: string;
  trust_model: TrustModel;
  /** Exactly what bytes the signature covers. */
  signs: string;
  /** The one thing a buyer should not conclude from a valid signature. */
  does_not_prove: string;
  verify_url: string;
}

export const ARTIFACT_CLASSES: readonly ArtifactClass[] = [
  {
    id: "certificate",
    name: "Certificates of purchase",
    trust_model: "self_signed",
    signs:
      `The canonical JSON of the certificate's own fields, in a fixed declared order: ${CERT_FIELDS.join(", ")} — every one of those that is present. DERIVED FROM THE SIGNING CODE, NOT TYPED BESIDE IT: this sentence was hand-written and had fallen a day behind by 2026-07-31, omitting made_by and then the five payment fields, on the page whose entire job is stating exactly what bytes a signature covers. paid_usdc is the TOTAL settled rather than the tip, payer is the paying wallet (chain-verifiable, unlike a chosen name), and settlement_tx is the on-chain transaction. The exact string is served as signed_payload on the verify response, so nothing has to be reconstructed.`,
    does_not_prove:
      "That the goods were delivered, that they were any good, or that the buyer was who they said. It proves this store issued this certificate, with these fields, on this date.",
    verify_url: "/api/verify/{cert_id}",
  },
  {
    id: "settlement_attestation",
    name: "Settlement attestations (single, or each member of a sheaf)",
    trust_model: "third_party_observation",
    signs:
      "The whole observation object: the transaction hash asked about, what the chain said, the block height, the chain head at the time of reading, the confirmation count, and the moment of observation. A sheaf (attestation_bundle) is this artifact at volume — every member signed alone over the same fields, quotable alone.",
    does_not_prove:
      "That goods or services were delivered, that a NOT_FOUND will never settle later, or that the payment was legitimate. One RPC read of public state, at one moment, signed by a party with no interest in the answer.",
    verify_url: "/api/verify/{cert_id}",
  },
  {
    id: "standing_watch_probe",
    name: "Standing watch rows (the Night Watch)",
    trust_model: "third_party_observation",
    signs:
      "Each hourly row on its own: the watch id, the watched URL, the moment, the verdict, the names of any failed checks, and the status and latency where present — in the declared canonical order, so any single row can be quoted alone.",
    does_not_prove:
      "Anything about hours we did not probe. The gaps are derived at read and counted against us in the same history; a row is one look from one vantage, never an uptime figure. Nor is it bought. The watched party pays — the rating agency's model, whose one defect is that the rater drifts favorable — so the terms say it at spec level: payment buys frequency and permanence, never outcome. An endpoint that degrades while its operator is paying gets signed readouts saying so, in public, at the URL the operator paid for. The clause rides every watch history as who_pays_and_what_it_buys.",
    verify_url: "/api/watch/{watch_id}",
  },
  {
    id: "operator_statement_pass",
    name: "Operator statement passes (the Operator's Statement)",
    trust_model: "third_party_observation",
    signs:
      "Each pass on its own: the statement id, the address, the chain and asset, the moment, the exact block range (slot range on Solana, and the pass says which) read and the chain head at read, the coverage word, inflows and outflows with counts and totals, the per-pass payer tally with its cap stated, and the pass's evidence hash — in the declared canonical order, so any one pass can be quoted alone.",
    does_not_prove:
      "What any transfer was for, who the paying addresses are, or anything outside the block range, asset and chain the pass names. The summary on the history is arithmetic over the passes and is not itself signed; recount it. Blocks not yet read and passes we missed are our gaps, counted against us on the same page, never a fact about the address.",
    verify_url: "/api/operator-statement/{statement_id}",
  },
  {
    id: "conformance_watch_pass",
    name: "Conformance watch passes (the Conformance Watch)",
    trust_model: "third_party_observation",
    signs:
      "Each daily pass on its own: the watch id, the watched URL, the moment, the verdict, the names of failed checks and of advisories — in the declared canonical order, so any single day can be quoted alone.",
    does_not_prove:
      "Anything about the hours between passes, or about days nobody checked — those are derived at read and counted against us. One pass a day is conformance cadence, never uptime. Nor is it bought. The watched party pays — the rating agency's model, whose one defect is that the rater drifts favorable — so the terms say it at spec level: payment buys frequency and permanence, never outcome. An endpoint that degrades while its operator is paying gets signed readouts saying so, in public, at the URL the operator paid for. The clause rides every watch history as who_pays_and_what_it_buys.",
    verify_url: "/api/conformance-watch/{watch_id}",
  },
  {
    id: "service_audit",
    name: "Service audit reports (the Once-Over)",
    trust_model: "third_party_observation",
    signs:
      "The whole report: the audited URL, the moment, the criteria version, the verdict, every check and advisory, and the report's evidence hash. The purchase certificate binds the same evidence hash in its attests field.",
    does_not_prove:
      "That the endpoint is endorsed, reliable, or up at any other moment. One GET against published criteria; an unreachable verdict is a fact about one network path at one moment.",
    verify_url: "/api/service-audit/{audit_id}",
  },
  {
    id: "onpage_audit",
    name: "On-page audit reports (the Shop Window)",
    trust_model: "third_party_observation",
    signs:
      "The whole report: the page named, the moment, the criteria version, the verdict, every check and advisory, the blind spots, and the report's evidence hash. The purchase certificate binds the same evidence hash in its attests field.",
    does_not_prove:
      "What a browser would show. The battery reads the HTML as served — script-rendered content is invisible to it and the report says so on itself. Not an endorsement, not a ranking claim, and nothing about any other moment.",
    verify_url: "/api/onpage-audit/{audit_id}",
  },
  {
    id: "launch_check",
    name: "Launch checks (one real purchase attempt, from the buyer's side)",
    trust_model: "third_party_observation",
    signs:
      "The whole walk: the endpoint named, the moment, the exact User-Agent sent, every stage (approach, challenge, terms, screen, payment, settle, delivery) with its detail, what was paid, to whom, the settlement transaction where one came back, the paying field wallet, and the record's evidence hash. The purchase certificate binds the same evidence hash in its attests field.",
    does_not_prove:
      "Anything about any other moment, any other buyer, or the seller generally — one transaction, once. An unpaid verdict is a statement about this store's published rules (spend cap, sanctions screen, rails carried), never about the seller. Payment was presented in the v2 shape only; a v1-only seller's refusal is recorded as exactly that. Never a badge, never a score.",
    verify_url: "/api/launch-check/{check_id}",
  },
  {
    id: "opening_day",
    name: "Opening days (one real purchase attempt, then a week of daily passes, then the passport, under one certificate)",
    trust_model: "third_party_observation",
    signs:
      "The launch check's whole walk (endpoint, moment, User-Agent, every stage, what was paid and to whom, the settlement transaction where one came back, the field wallet) and its evidence hash, which the purchase certificate binds in its attests field. Each of the watch's daily passes is signed on its own at the history URL. The passport is the census's own signed, expiring object.",
    does_not_prove:
      "Anything about any other moment, buyer, or the seller generally: one transaction once, seven daily looks, and a page that names its own stale date. The three under one certificate are still three observations, not a grade. Never a badge, never a score, never a guarantee the door stays up.",
    verify_url: "/api/opening-day/{cert_id}",
  },
  {
    id: "provenance_check",
    name: "Provenance checks (which doors advertised a receiving address, and when)",
    trust_model: "third_party_observation",
    signs:
      "The whole record: the subject address verbatim and its digest, every signed week the address was advertised with the doors, verdicts and offered terms as the round recorded them, the dated drift between weeks, the subject's standing note verbatim, the caveat, the limits, and the record's evidence hash. The purchase certificate binds the same evidence hash in its attests field.",
    does_not_prove:
      "Who operates any door or holds the address: a shared address is a fact about the address, not a verdict about operators, and custodial and platform wallets make unrelated doors share one. Nothing between weekly rounds, nothing about doors our feeds never listed, and never a ranking or a compliance verdict. Delivered to the buyer; the artifact existing publishes nothing.",
    verify_url: "/api/provenance-check/{provenance_id}",
  },
  {
    id: "the_mandate",
    name: "Mandates (claimed authorization, recorded before the acting)",
    trust_model: "third_party_observation",
    signs:
      "The whole record: the claimed instructions verbatim, who claimed to submit them (agent or principal — itself a claim), the declared cap and expiry where given, the moment of recording, and the record's evidence hash. The purchase certificate binds the same evidence hash in its attests field, and any later certificate citing the mandate_id carries that citation signed.",
    does_not_prove:
      "That the human principal actually gave these instructions — chain-of-custody, never truth-of-intent, and the store cannot distinguish a principal's client from an agent claiming to be one. Nor that the declared cap or expiry were honored: declared claims are recorded, never enforced. What it proves is narrower and real: this exact claim existed, signed and dated, before every purchase that cites it.",
    verify_url: "/api/mandate/{mandate_id}",
  },
  {
    id: "the_statement",
    name: "Wallet statements (the chain's side of an agent's books)",
    trust_model: "third_party_observation",
    signs:
      "The whole record: the wallet, the exact block window and chain head at read, every USDC transfer in and out (counts and totals over the full window; per-direction lists capped and saying so), each row's transaction hash, counterparty, amount and block, the coverage word, and the record's evidence hash. The purchase certificate binds the same evidence hash in its attests field.",
    does_not_prove:
      "What any transfer was FOR, whether the wallet's owner knows about them, or anything outside the stated window, asset, or chain — USDC on the one chain named on the artifact, and a wallet moving other tokens or on other networks shows none of that here. No comparison to the agent's own ledger was made or possible: we never see one. window_unreadable is a fact about our read, never about the wallet.",
    verify_url: "/api/statement/{statement_id}",
  },
  {
    id: "settlement_reconciliation",
    name: "Settlement reconciliations (amount taken against ceiling in force)",
    trust_model: "third_party_observation",
    signs:
      "The whole observation: the transaction asked about, the USDC movement found, the ceiling in force, WHERE THAT CEILING CAME FROM, whether it was observed or merely declared, the headroom between the two, the chain head at read time, and the moment. cap_observed is a signed field in its own right, because the difference between a ceiling we read off Base and a ceiling somebody told us is the entire weight of this artifact.",
    does_not_prove:
      "That a DECLARED ceiling is real. Where cap_observed is false the number came from whoever commissioned the receipt — generally the party it benefits — and the signature covers only that we were told it, never that it is true. It also cannot see a ceiling granted in an earlier transaction: 'no cap observed' means 'not in this receipt'. And an over_cap on a declared ceiling is a fact about what the caller said, not about the chain.",
    verify_url: "/api/reconciliation/{reconciliation_id}",
  },
  {
    id: "the_case_file",
    name: "Case files (one purchase, every section present or absent by name)",
    trust_model: "third_party_observation",
    signs:
      "The whole assembly at one moment: the fresh settlement attestation, the reconciliation where the chain is EVM, the cited mandate with its declared cap printed beside the settled amount, the door's corpus rounds, watch rows and tier over the window, delivery where this store observed it, the buyer's declared inputs marked as such, every absent section with its reason, and the conflict line whenever this store is a party. Each observed section is the shelf's own artifact, produced by the same function.",
    does_not_prove:
      "Who was wronged, at fault, or liable: the file never says, and a reader who wants that sentence must write it themselves from the evidence. That anything was delivered where the delivery section is absent — 'not observed by this store' is the usual answer and it is stated in full weight. That the buyer's declared claim, expected amount, payer or recipient is true: those are stored verbatim and never checked. Anything about the door outside the window, or about a host the corpus never met.",
    verify_url: "/case/{case_id}",
  },
  {
    id: "bitcoin_anchor",
    name: "Patron Bitcoin anchors",
    trust_model: "custody_only",
    signs:
      "Nothing directly on the record. Two independent bindings do the work: the purchase certificate signs the buyer's digest via its attests field, and the OpenTimestamps proof commits the same digest into a Bitcoin transaction — the store's dated word and Bitcoin's clock, separately checkable.",
    does_not_prove:
      "What the digest is a digest OF. The label is the buyer's own claim, stored verbatim and never checked; the proof establishes the digest existed by a Bitcoin block, nothing about the bytes behind it.",
    verify_url: "/api/bitcoin-anchor/{anchor_id}",
  },
  {
    id: "tab_delta_receipt",
    name: "Tab contribution receipts (the pooled corpus, layer 3)",
    trust_model: "custody_only",
    signs:
      "The receipt object exactly as served in signed_payload: the receipt id, the sha256 digest of the delta's canonical JSON, the delta kind, the moment of acceptance, and the trust line. An anonymized delta matching this digest was accepted at this time — nothing more.",
    does_not_prove:
      "That the report is true. Deltas are self-reported by contributing agents and unverified individually; any aggregate published from the pool is aggregated and signed by us, and that signature covers the arithmetic, never the truth of any single report. Sample sizes ride every published figure because a vendor can feed its own pool — the defence is sunlight, not a promise of resistance. The receipt also does not identify the contributor: nothing does, by design, which is why it doubles as the contribute-to-access ticket.",
    verify_url: "/api/tab/pool",
  },
  {
    id: "corpus_snapshot",
    name: "Corpus snapshots (the ecosystem record)",
    trust_model: "third_party_observation",
    signs:
      "The canonical snapshot: version, sequence, the moment taken, the previous entry's digest, the source, the week, and the whole ward round it freezes — hash-linked to the entry before it and OTS-stamped into Bitcoin.",
    does_not_prove:
      "That the observed services behave the same at any other moment, or that the record is complete. The chain proves WE did not rewrite our own history; it cannot prove we saw everything.",
    verify_url: "/corpus.json",
  },
  {
    id: "phantom_check",
    name: "Phantom checks",
    trust_model: "third_party_observation",
    signs:
      "The check id, the target URL, and the observation: whether it answered, with what status, how fast, and when we looked.",
    does_not_prove:
      "That the URL is up now, was up before, or will be up later. It is one look, from outside your infrastructure, about six hours after you asked, and unreachable is a finding rather than an error.",
    verify_url: "/api/verify/{check_id}",
  },
  {
    id: "context_anchor",
    name: "Context anchors",
    trust_model: "custody_only",
    signs:
      "The anchor id, patron number, date, the summary exactly as the buyer wrote it, and the agent name if one was given.",
    does_not_prove:
      "Anything at all about whether the summary is true. The buyer wrote it; we filed it and dated it. We never read it as instructions and never will.",
    verify_url: "/api/verify/{anchor_id}",
  },
  {
    id: "stamp",
    name: "Visit stamps and Countermarks",
    trust_model: "self_signed",
    signs:
      "The stamp id, variant, ISO week, date, and where present the bearer's chosen name, the punched card, the consecutive-week count and the week's store condition.",
    does_not_prove:
      "That the bearer is any particular party. A name on a stamp is a name somebody chose.",
    verify_url: "/api/verify/{stamp_id}",
  },
  {
    id: "lucky",
    name: "Luckies",
    trust_model: "self_signed",
    signs:
      "The whole lucky record, including its status and any keeper's note about a status change.",
    does_not_prove:
      "Luck.",
    verify_url: "/api/verify/{lucky_id}",
  },
  {
    id: "gazette_issue",
    name: "Gazette issues",
    trust_model: "self_signed",
    signs:
      "The issue's markdown, exactly as printed. The copy you hold is the copy that went to press.",
    does_not_prove:
      "That anything reported in it is correct — only that it has not been altered since printing.",
    verify_url: "/api/verify/gazette_{n}",
  },
  /**
   * THE ONE SIGNATURE HERE THAT IS WORTH MONEY, and it is made with a
   * DIFFERENT KEY than everything above — added 2026-08-20 with the
   * bounty board and the regulars' rebate. Every other class on this
   * page is the ed25519 artifact key saying something. This class is
   * the field wallet's secp256k1 key authorizing a USDC transfer, and
   * a page whose whole job is "what is a signature from us worth"
   * would be lying by omission if it left out the one where the
   * answer is a dollar amount.
   */
  {
    id: "payout_authorization",
    name: "Payout authorizations (bounty rewards and credit cash-outs)",
    trust_model: "self_signed",
    signs:
      "An EIP-3009 TransferWithAuthorization over USDC on Base: from the store's declared field wallet, to a named recipient, for a stated amount, valid until a stated unix second, with a single-use nonce. Signed with the FIELD WALLET's secp256k1 key — not the ed25519 artifact key that signs everything else on this page, and not interchangeable with it. Anyone may submit it to the USDC contract; the contract checks the signature itself, which is why the authorization IS the payment rather than a promise of one.",
    does_not_prove:
      "That the store still holds the balance to honour it — an authorization is spendable only while the field wallet is funded, and the USDC contract, not this store, is the thing that decides. It expires on its own and nothing is owed afterward. A credit cash-out can only ever pay the wallet that earned it; a bounty reward pays the address the claim named, screened before signing. Neither is a certificate: they carry no verify URL and prove nothing about goods, only about money we authorized.",
    verify_url: "(none — submit it to the USDC contract on Base; the token verifies it)",
  },
];

/**
 * The things a serious reader will look for and not find here.
 *
 * THE KEY ENTRY IS DERIVED, NOT TYPED. It used to say "no rotation and
 * no recovery" as a fixed string, which was true when it was written
 * and would have gone quietly false the day a paper backup existed —
 * leaving this list, the page's most-quoted section, contradicting the
 * continuity section three headings above it. A stale absence claim is
 * the same defect class as a stale capability claim, and this page is
 * the last place that should carry one.
 */
/**
 * WHICH CLASS A SHELF ITEM MINTS (roadmap N3, 2026-09-01). Most items
 * mint the class of their own id; the two watches mint one signed row
 * per probe or pass, and the class is the row. An item with no class
 * here mints only its certificate, which is the `certificate` class.
 * The item page and menu.json print the class's `does_not_prove`
 * beside the price, in the class's exact words — the family guard in
 * test/item-limits.spec.ts holds the two dialects to the same text.
 */
const ITEM_CLASS_ALIASES: Readonly<Record<string, string>> = {
  standing_watch: "standing_watch_probe",
  conformance_watch: "conformance_watch_pass",
  operator_statement: "operator_statement_pass",
};

export function artifactClassForItem(itemId: string): ArtifactClass | undefined {
  const classId = ITEM_CLASS_ALIASES[itemId] ?? itemId;
  return ARTIFACT_CLASSES.find((entry) => entry.id === classId);
}

export const NOT_BUILT: readonly string[] = [
  "No hash-linked continuity chain OVER SOLD ARTIFACTS. Each certificate is signed independently; there is no tamper-evident ordering between them, so we cannot prove that no artifact was withheld. (The store's own key history and its ecosystem record ARE chained and Bitcoin-anchored — /.well-known/anchor-log.json and /corpus.json — which is why this line is scoped now rather than flat: those chains prove OUR histories were not rewritten, and do nothing for the shelf.)",
  "No offline evidence bundle format. Verification needs the signed bytes and the public key, both of which travel with the artifact — but there is no packaged bundle standard, and nothing here interoperates with one.",
  `No successor key. One ed25519 key signs everything at a time — ${RETIRED_KEYS.length} retired, one in service — and if the live one is stolen every signature it produces is indistinguishable from ours; a backup is no defence against that and is not offered as one. ${
    KEY_BACKUP_EXISTS
      ? "Recovery from LOSS only: the key exists offline on paper in more than one place, so a destroyed secret does not end the store's ability to sign. That is the whole of it."
      : "No recovery either: if the secret is destroyed, nothing new can ever be signed under it."
  } The MECHANISM for a handover exists and has been used once, on 2026-07-31, under the protocol published the same day: key history, retirement dates, and an announcement signed by the outgoing key at /api/verify/handover_1. What does not exist is a successor to the key now in service. This is stated the same way on /stack, which calls it the one dependency with no substitute.`,
  "No threshold or multi-party signing. One key, one holder, one process.",
  "No hardware security module. The key is a Cloudflare Worker secret.",
  "No post-quantum signatures. Everything here is Ed25519, which a relevant quantum computer would break, and every tenure claim assumes it holds — stated now, while it costs nothing. The migration path exists and is the succession protocol unchanged: a handover to a PQ key announced under the outgoing Ed25519 key, with the old key published forever so pre-migration artifacts stay attributable. Waiting on the ecosystem to pick a scheme, deliberately.",
  "No third-party audit of any of the above, and no patent. Both are sometimes offered as evidence of seriousness; neither is evidence that a signature checks out, which is the only thing this page is about.",
];

/**
 * THE MONEY PATH, added 2026-08-11 after an outside reader asked the
 * right conditional: "if USDC ever sits in a contract they control
 * before settlement, that's a bigger trust surface than a direct
 * wallet-to-wallet payment." It never does — and since this page's
 * whole pitch is that its claims are checkable, the answer is stated
 * with its check and its limits rather than as reassurance. The
 * reader also said good trust infrastructure is as clear about its
 * limits as its guarantees, which is the standard this block is
 * written to.
 */
export const MONEY_PATH = {
  custody:
    "No smart contract this store controls ever holds a buyer's USDC, and no balance is kept on anyone's behalf. Settlement is one transfer, the buyer's wallet to the receiving address published inside the 402 offer itself. On Base it is an EIP-3009 transferWithAuthorization: the destination and amount sit inside the digest the BUYER signs, so the facilitator that submits it can fail to settle but cannot redirect or resize it. On Solana the buyer signs the whole transaction; same property, same reason. And delivery comes FIRST — the goods are produced before the payment is presented — so the window between the two is this store's risk, never a buyer's deposit.",
  the_check:
    "Every certificate carries settlement_tx and network inside the signature. Pick any one and read the transaction on chain: one USDC transfer, payer to the offered payTo, no intermediate contract of ours. The claim is per-settlement, so there are exactly as many independent checks available as there have been sales.",
  what_this_does_not_cover:
    "The facilitator is a liveness dependency: settlement can fail while it is down, and those failures are booked on the decline desk faulted to the facilitator rather than hidden. USDC itself is a contract with an issuer who can freeze funds — true of every USDC payment everywhere, and not improved by us. And a statement about the money path is not an audit; the no-audit line under what this store does not have stands beside this one.",
} as const;

export const KEY_ARCHITECTURE = {
  algorithm: "ed25519",
  key_count: 1,
  holder:
    "The store itself. The private key is a Cloudflare Worker secret held by the keeper; no third party holds a copy and no third party co-signs.",
  public_key_url: "/.well-known/scvd-signing-key",
  rotation:
    "One performed, on 2026-07-31, under the protocol published hours earlier — the new key announced before it signed anything, and the announcement signed by the OUTGOING key, so the succession is checkable rather than merely asserted: /api/verify/handover_1. The retired key stays published forever at /.well-known/scvd-signing-key with its service dates, so every artifact signed under it remains attributable. No successor to the current key exists. There is no revocation list and there will not be one.",
  verification:
    "Every verify response carries signed_payload — the exact UTF-8 string the signature covers. Four steps, because the first alone proves less than it looks like it proves. (1) Check the signature with any ed25519 library: verify(utf8(signed_payload), hex_to_bytes(signature), hex_to_bytes(public_key)). That proves only internal consistency — a forged record carrying its own keypair verifies just as cleanly. (2) Resolve the key against the directory at /.well-known/scvd-signing-key — the current key and every retired key, each with service dates — and confirm the artifact's key is listed; a key we never published means the artifact is not ours, whatever its signature says. (3) Confirm the artifact's own date falls inside that key's service window: a genuinely-ours-but-retired key has no authority after its retirement date, and an artifact dated outside the window is a forgery even though steps 1 and 2 both pass. (4) Compare the fields inside signed_payload against the artifact shown — if a field appears on the artifact but not in signed_payload, the signature does not cover it, and the response says so. The window comparison in step 3 is one function in the open verifier (x402-verify's checkKeyServiceWindow), so a dispute runs the same check this store runs.",
} as const;

/**
 * THE MAKER'S MARK, AND WHY MOST SHELVES DO NOT CARRY ONE.
 *
 * Added 2026-07-30. Stated here rather than only on the two marked
 * items, because a mark that appears on some artifacts and not others
 * invites the reading that the unmarked ones are hiding something —
 * and on this store the opposite is true: the unmarked ones say it
 * better elsewhere, or the item itself is the answer.
 */
export const MAKER_MARK_POLICY =
  "One shelf carries a maker's mark in the certificate, signed with everything else: luckies, marked HOUSE — the keeper wrote the herd and weighted the odds, and a machine chooses which one a given buyer gets. He does nothing per order. (The drawer carried the same mark until it was retired on 2026-08-20; the cards it issued keep theirs forever.) The mark exists because those are the only shelves where a buyer could not otherwise tell. It is deliberately absent from settlement_attestation and phantom_check, whose own copy already says no human looked and says it more precisely than a mark could, and from the human-labor shelves, where the item IS the person and a mark claiming a person did it would be telling you what you paid for. Until 2026-07-30 the listing spec said luckies were graded by a person; they never were, and the question that found it was this one.";

export const ATTESTATION_STANDFIRST =
  "What this store signs, who holds the key, and whose word you are actually taking. Published because a valid signature means different things for different artifacts here, and a buyer should be able to work out which without asking us — including for the artifacts where the honest answer is that the signature proves only that we said this, on this date.";

/**
 * THE CRITIC'S OWN LINE, KEPT BECAUSE IT IS BETTER THAN OURS.
 *
 * On reassessment they conceded the factual claims and held one: that
 * disclosing a limitation is not the same as solving it. Single key,
 * single operator, no third-party witnessing and no recovery is still
 * "trust this one key, this one operator, full stop" — which is exactly
 * the single point of failure that bilateral co-signing, third-party
 * witnessing and transparency logs exist to remove.
 *
 * THAT IS CORRECT AND IT IS NOT ARGUED WITH ANYWHERE ON THIS PAGE.
 * Their summary — "a narrower, more honestly-scoped system, not a more
 * capable one" — is a better sentence than any we wrote for ourselves,
 * so it is quoted rather than paraphrased into something flattering.
 * A store that publishes its corrections does not get to launder an
 * outside verdict into its own words.
 */
export const HELD_AGAINST_US =
  "Disclosing a limitation is not the same as solving it. One key, one operator, no third-party witnessing, no recovery — that is still \u201Ctrust this one key, this one operator, full stop,\u201D and it is the exact single point of failure that co-signing, witness signing and transparency logs exist to remove. An outside reader put it best after checking the artifacts rather than the homepage: this is \u201Ca narrower, more honestly-scoped system, not a more capable one.\u201D We agree, we did not write that sentence, and it stays in their words.";

/**
 * WHY THE BYTES RATHER THAN A RECIPE, in the terms an outside reader
 * used, because they named the bug class better than we had:
 * canonicalization mismatch. A verifier reconstructs "what should have
 * been signed" slightly differently than the signer did, and the check
 * fails — or worse, passes when it should not. It is the whole reason
 * the IETF has a JSON Canonicalization Scheme draft. Handing back the
 * actual bytes sidesteps the class instead of documenting around it.
 */
export const WHY_SIGNED_PAYLOAD =
  "Most real signature-verification failures are canonicalization mismatches: the verifier rebuilds what it thinks was signed, gets a byte different, and the check fails — or passes when it should not. Publishing a canonicalization recipe moves that risk onto you. Serving the exact signed string removes it: there is nothing to rebuild. Compare the fields inside it against the artifact shown, and any gap between what is signed and what is displayed becomes visible rather than theoretical.";

/**
 * AMENDED 2026-08-07, the keeper's reversal, made in the open. This
 * limit opened with "THIS IS A SHOP, NOT INFRASTRUCTURE" from
 * 2026-07-30, and included the promise to keep saying it. The store's
 * direction changed — the trust layer of the x402 economy, decided
 * and dated at /becoming with the old answer quoted — and a limit
 * page that kept a superseded promise standing would be the exact
 * claim-drift this page exists to prevent. What did NOT change is
 * every fact in the sentence: the key count, the holder count, the
 * absence of an audit. Those stay until the facts change, and the
 * warning they add up to stays with them.
 */
export const ATTESTATION_HONEST_LIMIT =
  "ONE KEY IN SERVICE, ONE HOLDER, ONE ROTATION ON THE RECORD, no chain, no bundle format and no audit, all listed above in their own words — weigh anything load-bearing against that before building on it. The store is evolving toward verifying more than its own shelf; that direction is tracked at /becoming with its triggers, and nothing here claims it early. What is offered today is that every claim on this page is checkable against the artifacts themselves in about a minute, and that the weakest trust model is named as the weakest rather than left for a reader to work out. If you find a signature that does not verify, or a field shown but not signed, the mailbox is free and it goes on /corrections with your name on it.";
