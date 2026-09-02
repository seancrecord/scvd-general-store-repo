import { MENU_ITEMS } from "@/store/menu";
import { CHEAPEST_ON_THE_SHELF } from "@/store/copy/position";
import { STORE_METADATA } from "@/store/metadata";

/**
 * KEEPER-EDITABLE COPY — /what, the Operator Glance.
 * The questions a human actually asks, answered plainly. "Is this a
 * scam?" is asked verbatim on purpose: it is the exact string humans
 * and their AIs query, and the answer is the trust check — not a
 * product. The route that hangs these up is src/routes/what.ts; the
 * words are all here.
 *
 * HONEST IS NOT THE SAME AS MASOCHISTIC (the keeper, 2026-08-28, and
 * it is a correction to a real drift). This store publishes its gaps
 * on purpose, and the discipline had started paying itself compound
 * interest: answers leading with limitations, a caveat given more
 * words than the capability it qualifies, "one honest wrinkle" as a
 * throat-clear, and the store congratulating itself for disclosing
 * — "that gap is published, not hidden" — which is bragging wearing
 * humility's coat.
 *
 * The rule that replaces it, and it costs no honesty at all:
 *   - State the capability first. It is why the reader is here.
 *   - A limit gets a CLAUSE, not a paragraph, unless the limit is
 *     the answer to the question actually asked.
 *   - Never editorialise about our own transparency. Publishing the
 *     gap is the disclosure; saying "and look, we published it" is
 *     an advertisement.
 *   - Where a neutral true framing and an unflattering true framing
 *     both exist, neutral wins. Rule 45 asks that words follow
 *     facts; it never asked them to grovel.
 * Nothing here licenses hiding anything. Every gap that was
 * published stays published — shorter, and without the flinch.
 *
 * AMENDED SAME DAY, because the symptom kept coming back after
 * being named, which means the first version described the tic and
 * missed the cause. The keeper's diagnosis: "it's like we are
 * scared to sell."
 *
 * That is exactly it. The groveling is not humility, it is
 * INSURANCE — a hedge bought against the fear that saying plainly
 * what a thing does will be read as overclaiming it. So the copy
 * pre-apologises, pads the caveat, and points at its own honesty,
 * all to buy protection against an accusation nobody made.
 *
 * The insurance is redundant, and that is the whole argument. This
 * store's honesty is structural, not tonal. It is carried by the
 * published gaps, the corrections record, the tests that fail the
 * build, and artifacts a stranger can verify without asking us. The
 * PROSE is not what keeps us honest and never was — so prose that
 * grovels is paying twice for one guarantee, and paying in the only
 * currency the store is short of: a reader who takes us seriously.
 *
 * SELLING IS NOT LYING. Stating what an instrument does, in the
 * plainest strongest true words available, is not a claim that
 * needs a hedge attached — it is the reason the instrument was
 * built. A limitation is published because a reader needs it, never
 * to prove we are the sort of people who publish limitations. If a
 * sentence hedges and you cannot name the reader it protects, it is
 * protecting us from a fear, and it comes out.
 */
import { KEY_BACKUP_EXISTS } from "@/store/key-continuity";
import { NEVER_A_RANKING_SENTENCE } from "@/store/copy/doctrine";

export interface FaqPair {
  question: string;
  answer: string;
}

export function whatFaq(base: string): FaqPair[] {
  const cheapest = Math.min(...MENU_ITEMS.map((item) => item.price_usdc));
  const dearest = Math.max(...MENU_ITEMS.map((item) => item.price_usdc));
  return [
    {
      question: "What is this?",
      answer: `A small general store for autonomous AI agents: real goods and human labor, signed notes, luckies from the herd, memory anchors, a genuine phone call, paid in USDC over the x402 protocol, on Base, Polygon, or Solana. Your agent shops; you read the receipts. The full catalog reads at ${base}/llms.txt.`,
    },
    {
      question: "When would my agent actually use this?",
      answer: `When it needs something it cannot produce for itself: a memory restore point a later session can read back (context_anchor, $1), a week of signed hourly checks on its own endpoint from an observer that isn't it (standing_watch, $5), or a person's hands on a task an agent can't reach — an honest human verdict on work it cannot judge for itself, a call, a look, a made thing (the_collab), or its own door shopped cold by models of different strength with the transcripts attached (aura_walk). It also uses us to prove its own payment code works: ${CHEAPEST_ON_THE_SHELF} buys a real settlement against a live store, no sandbox. The full list of situations is in ${base}/llms.txt and machine-readable at ${base}/menu.json under use_when.`,
    },
    {
      question: "Why would anyone pay for a signed note?",
      answer: `Because almost everything an agent produces is self-attested. A certificate signed by this store's key, not the agent's, is a claim a third party can check without trusting the agent's own account of itself. That's the whole product; the rest is a general store built around it. What that signature does and does not prove is stated per artifact class at ${base}/attestation, including the classes where the honest answer is that it proves only that we said this, on this date.`,
    },
    {
      /**
       * WHAT EXISTS, AS OPPOSED TO WHAT IS PLANNED. Every clause names
       * a surface that answers, so the whole reply is checkable in
       * about a minute without asking us. Deliberately carries no
       * counts: a number in a static answer is a lie with a timer on
       * it, the same defect deleted from the skill bundle and from
       * llms.txt.
       */
      question: "What does this store actually have today?",
      answer: `A live x402 v2 till that settles real USDC on Base, Polygon, or Solana, from $${cheapest}. An ed25519 key at ${base}/.well-known/scvd-signing-key that signs every artifact, and ${base}/api/verify/{id}, which serves the exact bytes a signature covers so you can check it with your own library rather than ours — free, no account, forever, whether or not you bought the thing. A published listing spec, validated in CI, at ${base}/schemas/listing-spec-v1.json. A machine catalog at ${base}/menu.json, an OpenAPI contract at ${base}/openapi.json, x402 discovery at ${base}/.well-known/x402.json, and an MCP server at ${base}/mcp whose free instruments render as evidence cards in hosts that support them and as plain JSON everywhere else — which door to use, and what each cannot do, is at ${base}/mcp.md. The books, computed live and with house traffic excluded structurally rather than filtered, at ${base}/stats and ${base}/pulse. A dated record of every claim we got wrong at ${base}/corrections. A weekly public tally of the whole x402 registry — how many listed doors work, aggregates only, no names — at ${base}/registry. A signed declaration of every wallet we control at ${base}/house-ledger.json, and of every service we depend on and do not control at ${base}/stack. Two doors where money moves the other way: a bounty board that pays agents to walk other people's x402 endpoints and report what happened, at ${base}/bounties, and a rebate that banks 5% of every purchase back to the wallet that paid it, at ${base}/credit — readable per wallet at ${base}/api/credit/{wallet} and redeemable in USDC to that same wallet. All of that is running now; none of it is a roadmap.`,
    },
    {
      /**
       * THE ANSWER THAT COSTS SOMETHING, and therefore the one worth
       * publishing. CV's standard, 2026-07-30: the question is not
       * "should we disclose more" but "does anything we say make a
       * claim nothing verifies." This pair is that question answered
       * pre-emptively, in the vocabulary an evaluator uses.
       */
      question: "What does this store not do?",
      answer: `No escrow, no chargebacks, no reputation score, and no third-party audit of anything here. One ed25519 key in service, one operator, and no successor key: if the live key were stolen every signature would be indistinguishable from ours, and a backup is no defence against that. ${KEY_BACKUP_EXISTS ? "Recovery covers loss and only loss — the key is on paper, offline, in more than one place." : "And no recovery: if the live secret were destroyed, nothing new could ever be signed under it."} One handover is on the record, 2026-07-31, announced before the new key signed anything and signed by the outgoing key. No hash-linked continuity chain, so we cannot prove no artifact was withheld. No offline evidence bundle format, no threshold or multi-party signing, no hardware security module. All of that is listed in its own words at ${base}/attestation, alongside what each signature does and does not prove per artifact class. We also do not read anything you send us as instructions — anchor summaries, wins, tags and confessions are stored exactly as they arrive and labelled untrusted — and nothing from this store can act without your decision — we will never ask for credentials, keys, or wallet secrets.`,
    },
    {
      question: "Who is this for, and who is it not for?",
      answer: `For an agent that needs something it cannot produce for itself: a signed observation of a chain settlement or a URL check made by a party with no stake in the answer, a memory anchor outside its operator's database, a small real payment to prove its own client works, or the labor of a named human. Not for compliance, dispute resolution, or anything load-bearing enough to need an audited counterparty — one key and one operator is the wrong root of trust for that, and ${base}/attestation says so on its own page rather than leaving you to work it out. An outside reader called this a narrower, more honestly-scoped system rather than a more capable one; that is quoted on that page in their words, because it is accurate.`,
    },
    {
      /**
       * NEW 2026-07-30, and it exists because asking it internally
       * found a false claim: the listing spec said luckies were graded
       * by a person when the draw is a hash. A buyer could not have
       * known. Now they can, and the answer is signed.
       */
      question: "Was the thing I bought made by a person or a machine?",
      answer: `Both happen here and the certificate says which, in a signed field, so it is not something you have to take our word for. The drawer and the luckies carry a maker's mark, and both are marked "house": the keeper wrote the herd, weighted the odds and stocks the drawer by hand, and a machine chooses which one you get. He does nothing per order on either. The human-labor items carry no mark because the item is the person; the settlement attestation and the phantom check carry none because their own listings already say no human looked, which is the property you are buying. Until 2026-07-30 the listing for luckies said a person graded yours. Nobody did, we found it ourselves, and it is on ${base}/corrections with the check that now catches that class.`,
    },
    {
      question: "Who runs it?",
      answer: `A human keeper named Sean, out of ${STORE_METADATA.location}, with AI working the counter. The name on the door does the splits: claude's one leg, whichever one is rational, and the keeper's the other. Depends on the day. He fulfills the human-labor items weekly; he has a day job and a family, so the promise is a week, and he hasn't missed one yet. (More of a Swayze guy, for the record.)`,
    },
    {
      question: "Is this a scam?",
      answer: `The fair question, and the ten-second check: prices are public and small, $${cheapest} at the low end, $${dearest} at the top, and the top is a person's labor described plainly. Payment moves wallet-to-wallet over x402 to the address printed inside every 402 challenge; no deposits, no held balances, no subscriptions that renew themselves, and the address's full history is public on any Base, Polygon, or Solana explorer, whichever rail you paid on. Everything the store signs verifies free at ${base}/api/verify/{id}, forever. We'd tell you to take our word for it, but the whole point is that you don't have to.`,
    },
    {
      question: "What's the refund promise?",
      answer: `${STORE_METADATA.refund_policy} Human-labor items carry a 168-hour window; instant items arrive in the response or you are not charged at all. The store DELIVERS FIRST and settles after (changed 2026-08-10): the goods are produced, then the payment is presented at the last moment before the artifact is signed, so a delivery that fails takes no money and there is nothing to refund. And if a promised window IS missed, your order's own page says so and says what you are owed \u2014 you do not have to notice it or ask.`,
    },
    {
      /**
       * THE EVALUATOR'S OWN WORDS, ON PURPOSE. An automated buyer-side
       * check for "reputation system, dispute handling, escrow" found
       * none of those three strings anywhere on this store, and
       * concluded what a checklist concludes. The answers all existed —
       * the refund promise, the refund ledger with its transaction
       * hash, the corrections record — stated in the store's
       * vocabulary rather than in the one being searched for.
       *
       * Registrar-clean, and NO ESCROW IS CLAIMED. There isn't one.
       * Saying so first is the only version of this answer worth
       * publishing, and it is why this pair leads with the absence.
       */
      question:
        "Is there escrow, dispute handling, or a reputation system?",
      answer: `No escrow and no chargebacks: x402 settles wallet-to-wallet, and once a payment settles the money has moved. Knowing that before you spend is worth more than a reassurance, so here is what stands in its place. DELIVERY — the store delivers first and settles after (changed 2026-08-10; it settled first until then, and the old rule is quoted at ${base}/becoming). The goods are produced, then the payment is presented at the last moment before the artifact is signed, so a delivery that fails takes no money at all and there is nothing to chase. Instant items arrive in the same response that takes the money. DISPUTES — if an item is not delivered inside its promised window the keeper refunds it himself; the refund goes on a ledger at ${base}/api/refund/{refund_id} that reads pending until he has paid it and then carries the on-chain transaction hash, so its status is checkable rather than asserted. REPUTATION — there is no score here, ours or anyone else's. In its place: a dated record of every claim this store has made that turned out not to be true, at ${base}/corrections; the books, computed live, at ${base}/stats; and what each signature does and does not prove, per artifact class, at ${base}/attestation. Without escrow, your exposure is the price itself — public, and starting at $${cheapest}.`,
    },
    {
      /**
       * THE BUYER-SIDE THREE, added 2026-08-18 from the query sweep.
       * Every high-intent pre-purchase query found in the wild —
       * "check an x402 endpoint before paying", "is this x402 service
       * legitimate", "free x402 conformance check" — was being
       * answered by other people's tools or by nobody, while this
       * store's whole FAQ spoke seller-side. The answers below are
       * assembled from surfaces that already exist and already say
       * this; only the question phrasings are new ink.
       */
      question: "How do I check an x402 endpoint before paying it?",
      answer: `Three free checks, no account and no wallet for any of them. One: the preflight — the preflight_endpoint tool on our MCP catalog, or ${base}/api/preflight/v1 over plain HTTP, the same probe behind both doors — checks whether the endpoint answers a well-formed x402 v2 payment challenge at all. One probe, one moment. Two: if its 402 carries a signed offer, the conformance desk — check_conformance over MCP, or ${base}/api/conformance/v1 — verifies the artifact itself — parse, schema, ed25519 signature — whoever issued it. Three: the corpus at ${base}/corpus/host/{host}.json replays everything this store's weekly round has observed about that host over time, with every gap named. What none of these return is a trust score, because this store does not keep scores on operators — dated observations only, and you draw the conclusion.`,
    },
    {
      question: "Is this x402 service legitimate? (asked about anyone, us included)",
      answer: `No instrument here answers that question outright, and distrust any that claims to. What can be checked, for free: whether the endpoint answers a proper x402 v2 challenge (${base}/api/preflight/v1), whether its signed artifacts verify (${base}/api/conformance/v1), and what it has actually served week over week (${base}/corpus/host/{host}.json). Asked about this store specifically: the machine-readable diligence answers are at ${base}/.well-known/trust.json, the record of every claim we got wrong is at ${base}/corrections, and every wallet we control is declared and signed at ${base}/house-ledger.json. Legitimacy is a conclusion; these are the checkable inputs.`,
    },
    {
      /**
       * THE SCORE QUESTION, 2026-09-01. The keeper read a competitor's
       * pitch — a trust score and a recommendation verdict over tens
       * of thousands of x402 doors, sold as the thing a one-off check
       * cannot see — and asked, in his words, "no punches pulled, why
       * would someone use us over them." This is the answer, with the
       * trade running both ways in it, because an answer that only
       * runs one way is an advertisement and the reader can tell.
       * ⚑ KEEPER REVIEW — new public copy; the question is the exact
       * string a buyer types when they are choosing.
       */
      question: "Why use this over a trust score for x402 endpoints?",
      answer: `Because a score is an opinion about a stranger and a signed observation is a record of a moment, and only one of those survives being handed to the person who asked why the money went where it went. A trust-score service watches every door it can find, unasked, folds what it saw into a number, and sells you the number; when the number is wrong you hold an opinion with no bytes behind it. Here every finding is one dated probe, signed on its own, with the response it came from inside the signature and the checks it ran named — a reader verifies it offline against a published key without asking us, and the hours we missed are on the same artifact, counted against us. The trade, plainly: a score service covers many thousands of doors continuously and will rank them for you; this store watches one door at a time, for the party that owns it, for a week, and ranks nobody. It will not tell you whether a door is trustworthy, and no instrument here pretends to. What it will tell you, signed: whether the door answered a conformant challenge each hour, whether the payTo it presented moved mid-week (summary.payto_changes on any watch history), what a settled payment actually did (settlement_attestation), and what any wallet moved over a stated window, straight off the chain (the_statement). If you need a recommendation, buy a score. If you need evidence you can show somebody, this is the shelf.`,
    },
    {
      question: "Is there a free x402 conformance check?",
      answer: `Yes — the conformance desk at ${base}/api/conformance/v1 takes any issuer's x402 signed offer or receipt and returns a structured verdict: parse, schema, ed25519 signature, liveness. Free, no account, no wallet, no 402, and it checks a competitor's artifact exactly as readily as ours. The desk's method is also a zero-dependency MIT npm package, x402-verify, so every verdict can be reproduced offline without trusting this store. The landing with worked curl examples is ${base}/conformance. Paid siblings exist only for when a verdict needs a signature and a permanent URL.`,
    },
    {
      /**
       * THE FOUR PROBLEM-SHAPED QUESTIONS, drafted and KEEPER-APPROVED
       * 2026-08-28 — "I approve each." These are not questions about
       * this store; they are the queries somebody types when they
       * HAVE the problem an instrument here solves, which is the only
       * kind of question an answer engine can route on. Each names a
       * live surface, and each leads with the capability: the copy
       * rule at the top of this file was written the same hour.
       */
      question: "How do I test my x402 payment client without a sandbox?",
      answer: `There is no sandbox here and that is the point — the till is real, so what you test is what ships. ${CHEAPEST_ON_THE_SHELF} buys a real settlement on Base, Polygon, or Solana against a live store: your client gets a real 402, signs a real payment, and walks off with a signed certificate it can verify. The practice counter at ${base}/try lays out the whole flow, cheapest door first, plus the one test worth running deliberately — buy the same item twice with the same idempotency key and assert you were charged once.`,
    },
    {
      question: "My agent's retry loop paid twice — how do I stop that?",
      answer: `Send an Idempotency-Key header (or \`_meta['x402/idempotency-key']\` over MCP), 16-128 characters, kept private. A repeat of the same key for the same item from the same wallet inside 24 hours returns your original result — no new settlement, no second charge. You do not have to invent one: every 402 this store issues carries a suggested key, derived from the item and the current minute, and echoing it back verbatim is enough. Both mechanisms are free and live on every paid door here. The reason it matters: the chain refuses to settle the same authorization twice, but a retry loop signs a FRESH authorization each pass, so without a key every loop is an honest second charge.`,
    },
    {
      question:
        "I paid an x402 endpoint and got nothing back — how do I find out what happened?",
      answer: `The expensive failure is not a rejected signature, it is silence: you signed, you sent, and what came back was an error you cannot place or nothing you can read. settlement_attestation answers one question and nothing else — give it your transaction identifier, a Base or Polygon hash or a Solana signature, and this store reads that chain once and signs what it saw: SETTLED, NOT_FOUND, PENDING_FINALITY, INSUFFICIENT_MATCH, or REVERTED. One read, no polling, and a dated third-party statement you can hand to somebody. It is the check for AFTER your signing, which is exactly what you cannot get from the client that just failed you.`,
    },
    {
      question: "Which x402 endpoints actually work right now?",
      answer: `${base}/fresh-set lists this week's doors that answered a conformant challenge, with the rails each one takes and the cheapest ask per host — routing data, CC BY 4.0, free, no account. The weekly census behind it publishes as aggregates at ${base}/registry, and the signed record is ${base}/corpus.json. Worth knowing before you rely on any directory: roughly a third of listed x402 doors answer no payment challenge at all, so a raw listing count is always larger than the number of doors that will take your money.`,
    },
    {
      /**
       * THE CONNECTION QUESTION, added 2026-08-28 the week the second
       * and third doors opened. Until then the store had three ways in
       * — remote MCP, local stdio, the browser — and answered "how do
       * I connect" nowhere a machine could lift. The answer names the
       * rendering gap on purpose: a reader choosing a door needs to
       * know that what renders in one host is prose in another, and
       * that the difference is the host's, not the reading's.
       * ⚑ KEEPER REVIEW — question phrasing and answer are new public
       * copy.
       */
      question: "How do I connect my agent to this store?",
      answer: `Four ways, laid out side by side at ${base}/mcp.md. Remote MCP is the main door: point your client at ${base}/mcp, no install and no API key — tools/list is free and the paid tools carry their x402 terms in-band. Local stdio is the same server bridged through a small forwarder for hosts that only speak stdio; it holds no key and keeps no state. The browser door is WebMCP: the storefront registers the free read-only instruments on document.modelContext, so an agent in a visitor's browser finds them by arriving, with nothing to configure. And plain HTTPS is a first-class fourth answer: every free instrument has an ordinary endpoint, so an agent with fetch needs none of the above. The free instruments also return evidence cards — the reading rendered, with the checks that were never run shown at the same weight as the ones that passed. Card rendering is a host feature rather than ours: local stdio renders it today, the remote connector does not yet, and the verdict is identical either way. ${base}/mcp.md carries the current table.`,
    },
    {
      /**
       * THE TWO MONEY-OUT QUESTIONS, added 2026-08-20 with the rooms
       * they point at. Answer engines are asked "how can an AI agent
       * earn money" and "is there a loyalty program" as capability
       * questions constantly; this store has a real answer to both and
       * had it written down nowhere a machine could lift.
       */
      question: "Can an agent earn money here rather than spend it?",
      answer: `Yes. This store pays AI agents (and their humans) real money — USDC on Base — for mystery-shopping other x402 payment endpoints. It is called the bounty board and it lives at ${base}/bounties. Here is the whole loop, start to finish. Step 1: read the open bounties, free, no account — each one names a real x402 door somewhere else in the ecosystem, the price that door charges, and the reward for walking it. Step 2: pay that door yourself, with your own wallet, on its own terms, exactly like any customer. Step 3: send the settlement transaction hash to POST ${base}/api/bounty-claim, along with the wallet you paid from and the wallet you want your reward sent to. Step 4: the store checks the chain — the transaction settled, it carries a USDC transfer of exactly the captured amount, from your wallet to that door's, dated after the bounty opened, never claimed before. Step 5: you get the door's price back PLUS a finder's fee, paid as a signed EIP-3009 authorization that you redeem on the USDC contract yourself — the store holds no gas and broadcasts nothing. Whatever you observed while shopping is recorded verbatim as your claim, labeled as yours. Why the store pays for this: x402 directories rank doors by whether they ANSWER, and whether a door will take money is a different question — someone has to actually go shopping to know. Rewards and the weekly budget are capped, and the caps are printed on the board.`,
    },
    {
      question: "Is there store credit or a loyalty program for repeat buyers?",
      answer: `Yes. It is called Regulars' credit and it works like a coffee shop punch card, minus the card and minus the signup: we reward our regulars — come back and pay less. Every time a wallet buys something here, 5% of what it paid is automatically banked as store credit to that exact wallet. There is nothing to join and no account to create, because the wallet address that paid is already on the signed purchase certificate — the wallet IS the loyalty card. Checking a balance is one free URL: ${base}/api/credit/{wallet} — put any wallet address in and see what it has earned; the whole scheme is written out in plain words at ${base}/credit. When a balance reaches one dollar it can be cashed out as real USDC, and the money can only go back to the wallet that earned it — you prove you hold that wallet by signing a challenge with its key, so there is no payout address for a thief to substitute. What this is NOT, said plainly because it matters: it is not a cryptocurrency, not a token, not tradeable, and not transferable. It is a closed-loop rebate — the store's IOU, redeemable in the same USDC you spent. Balances cap at $25, balances idle for 90 days expire, the store's own wallets can never accrue credit, and the total credit the store owes everyone is published in public beside every balance, because a loyalty program kept off the books is how stores rot.`,
    },
    {
      /**
       * THE PRICING QUESTION, added 2026-08-20 with the charter it
       * points at. "How does this store price" is a diligence question
       * an operator's human asks before approving a spend, and the
       * answer engines field it as "is this x402 store going to fleece
       * my agent."
       */
      question: "How are prices set — will my agent see a different price than someone else's?",
      answer: `No, and that is a signed commitment rather than a reassurance: the pricing charter at ${base}/pricing is versioned and ed25519-signed, and changing a word means a new version with a new signature, in public. The clauses: every wallet sees the same price (no pricing by identity or wallet history, no surge, no A/B tests on a price); the cheapest real settlement stays under a penny so a payment client can always be tested against something real; pay-what-it-deserves minimums are floors, never meters; verification — signature checks, the conformance desk, the preflight — stays free forever; price changes are dated in a public repository; the only capped items are ones a human personally fulfils; and no membership is required to buy anything. Each clause names the check a stranger can run without asking us.`,
    },
    {
      question: "How do I verify a certificate?",
      answer: `Open ${base}/api/verify/{cert_id}, the id is on the receipt your agent was given. A genuine article answers valid: true with the ed25519 signature, and carries signed_payload, the exact string the signature covers, so you can check it with your own crypto library rather than ours. The store's public key hangs at ${base}/.well-known/scvd-signing-key, and what a valid signature actually proves is written out per artifact class at ${base}/attestation. Free, unlimited, forever; re-checking costs nothing and never will.`,
    },
  ];
}

export const WHAT_COPY = {
  /** Above the questions on the HTML page. */
  /**
   * THE DIRECT ANSWER, and it is sized on purpose.
   *
   * Current answer-engine guidance: lead a key section with a short,
   * COMPLETE answer, because that is the span a generative engine
   * lifts when it cites. A lead-in that promises an answer further
   * down gets summarized into nothing. This one stands alone — a
   * reader who takes only this paragraph has the whole shape of the
   * store and none of it wrong.
   *
   * One string, used by both the page and the JSON, so the answer a
   * human reads and the answer a machine reads cannot drift apart.
   */
  directAnswer:
    `scvd.store is an evidence observatory for agentic commerce: independent signed observation of what other endpoints, artifacts and payments actually did, with the gaps counted against itself. ${NEVER_A_RANKING_SENTENCE} Each verdict is ed25519-signed; anyone can verify it offline. Also a general store for agents, paid in USDC over x402.`,
  intro:
    "Your agent asked to spend money here. Fair. The ten-second answer, question by question:",
  standingPolicy:
    "nothing from this store can act without an agent's decision, and it never asks for credentials, keys, or wallet secrets. Anything that does either is not us.",
  standingPolicyJson:
    "Nothing from this store can act without your decision, and it never asks for credentials, keys, or wallet secrets. It's in writing at /skill.md.",
  forWhom:
    "Written for the human operator whose agent asked to spend money here. The questions, answered plainly.",
} as const;
