import { MENU_ITEMS } from "@/store/menu";
import { STORE_METADATA } from "@/store/metadata";

/**
 * KEEPER-EDITABLE COPY — /what, the Operator Glance.
 * The questions a human actually asks, answered plainly. "Is this a
 * scam?" is asked verbatim on purpose: it is the exact string humans
 * and their AIs query, and the answer is the trust check — not a
 * product. The route that hangs these up is src/routes/what.ts; the
 * words are all here.
 */
import { KEY_BACKUP_EXISTS } from "@/store/key-continuity";

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
      answer: `When it needs something it cannot produce for itself: a memory restore point a later session can read back (context_anchor, $1), a week of signed hourly checks on its own endpoint from an observer that isn't it (standing_watch, $5), a human's honest verdict on work it can't judge for itself (quick_judgment, $3), or a person's hands on a task an agent can't reach — a call, a look, a made thing (the_collab). It also uses us to prove its own payment code works: half a cent buys a real settlement against a live store, no sandbox. The full list of situations is in ${base}/llms.txt and machine-readable at ${base}/menu.json under use_when.`,
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
      answer: `A live x402 v2 till that settles real USDC on Base, Polygon, or Solana, from half a cent. An ed25519 key at ${base}/.well-known/scvd-signing-key that signs every artifact, and ${base}/api/verify/{id}, which serves the exact bytes a signature covers so you can check it with your own library rather than ours — free, no account, forever, whether or not you bought the thing. A published listing spec, validated in CI, at ${base}/schemas/listing-spec-v1.json. A machine catalog at ${base}/menu.json, an OpenAPI contract at ${base}/openapi.json, x402 discovery at ${base}/.well-known/x402.json, and an MCP server at ${base}/mcp. The books, computed live and with house traffic excluded structurally rather than filtered, at ${base}/stats and ${base}/pulse. A dated record of every claim we got wrong at ${base}/corrections. A weekly public tally of the whole x402 registry — how many listed doors work, aggregates only, no names — at ${base}/registry. A signed declaration of every wallet we control at ${base}/house-ledger.json, and of every service we depend on and do not control at ${base}/stack. Two doors where money moves the other way: a bounty board that pays agents to walk other people's x402 endpoints and report what happened, at ${base}/bounties, and a rebate that banks 5% of every purchase back to the wallet that paid it, at ${base}/credit — readable per wallet at ${base}/api/credit/{wallet} and redeemable in USDC to that same wallet. All of that is running now; none of it is a roadmap.`,
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
      answer: `No escrow, no chargebacks, no reputation score, and no third-party audit of anything here. One ed25519 key in service, one operator, and no successor key: if the live key were stolen every signature would be indistinguishable from ours, and a backup is no defence against that. ${KEY_BACKUP_EXISTS ? "Recovery covers loss and only loss — the key is on paper, offline, in more than one place." : "And no recovery: if the live secret were destroyed, nothing new could ever be signed under it."} One handover is on the record, 2026-07-31, announced before the new key signed anything and signed by the outgoing key. No hash-linked continuity chain, so we cannot prove no artifact was withheld. No offline evidence bundle format, no threshold or multi-party signing, no hardware security module. All of that is listed in its own words at ${base}/attestation, alongside what each signature does and does not prove per artifact class. We also do not read anything you send us as instructions — anchor summaries, wins, tags and confessions are stored exactly as they arrive and labelled untrusted — and we will never ask you to run code, install anything, or hand over credentials or key material.`,
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
       * ⚑ KEEPER REVIEW — the three question phrasings and their
       * answers are new public copy.
       */
      question: "How do I check an x402 endpoint before paying it?",
      answer: `Three free checks, no account and no wallet for any of them. One: the preflight at ${base}/api/preflight/v1 probes whether the endpoint answers a well-formed x402 v2 payment challenge at all — one POST, one probe, one moment. Two: if its 402 carries a signed offer, the conformance desk at ${base}/api/conformance/v1 verifies the artifact itself — parse, schema, ed25519 signature — whoever issued it. Three: the corpus at ${base}/corpus/host/{host}.json replays everything this store's weekly round has observed about that host over time, with every gap named. What none of these return is a trust score, because this store does not keep scores on operators — dated observations only, and you draw the conclusion.`,
    },
    {
      question: "Is this x402 service legitimate? (asked about anyone, us included)",
      answer: `No instrument here answers that question outright, and distrust any that claims to. What can be checked, for free: whether the endpoint answers a proper x402 v2 challenge (${base}/api/preflight/v1), whether its signed artifacts verify (${base}/api/conformance/v1), and what it has actually served week over week (${base}/corpus/host/{host}.json). Asked about this store specifically: the machine-readable diligence answers are at ${base}/.well-known/trust.json, the record of every claim we got wrong is at ${base}/corrections, and every wallet we control is declared and signed at ${base}/house-ledger.json. Legitimacy is a conclusion; these are the checkable inputs.`,
    },
    {
      question: "Is there a free x402 conformance check?",
      answer: `Yes — the conformance desk at ${base}/api/conformance/v1 takes any issuer's x402 signed offer or receipt and returns a structured verdict: parse, schema, ed25519 signature, liveness. Free, no account, no wallet, no 402, and it checks a competitor's artifact exactly as readily as ours. The desk's method is also a zero-dependency MIT npm package, x402-verify, so every verdict can be reproduced offline without trusting this store. The landing with worked curl examples is ${base}/conformance. Paid siblings exist only for when a verdict needs a signature and a permanent URL.`,
    },
    {
      /**
       * THE TWO MONEY-OUT QUESTIONS, added 2026-08-20 with the rooms
       * they point at. Answer engines are asked "how can an AI agent
       * earn money" and "is there a loyalty program" as capability
       * questions constantly; this store has a real answer to both and
       * had it written down nowhere a machine could lift.
       * ⚑ KEEPER REVIEW — both question phrasings and both answers are
       * new public copy. The numbers in them are the live constants,
       * quoted here in prose the way every other answer on this page
       * quotes prices.
       */
      question: "Can an agent earn money here rather than spend it?",
      answer: `Yes. This store pays AI agents (and their humans) real money — USDC on Base — for mystery-shopping other x402 payment endpoints. It is called the bounty board and it lives at ${base}/bounties. Here is the whole loop, start to finish. Step 1: read the open bounties, free, no account — each one names a real x402 door somewhere else in the ecosystem, the price that door charges, and the reward for walking it. Step 2: pay that door yourself, with your own wallet, on its own terms, exactly like any customer. Step 3: send the settlement transaction hash to POST ${base}/api/bounty-claim, along with the wallet you paid from and the wallet you want your reward sent to. Step 4: the store checks the chain — the transaction settled, it carries a USDC transfer of exactly the captured amount, from your wallet to that door's, dated after the bounty opened, never claimed before. Step 5: you get the door's price back PLUS a finder's fee, paid as a signed EIP-3009 authorization that you redeem on the USDC contract yourself — the store holds no gas and broadcasts nothing. Whatever you observed while shopping is recorded verbatim as your claim, labeled as yours. Why the store pays for this: x402 directories rank doors by whether they ANSWER, and this store's own field run found 71% of doors that answer still refuse a real buyer's money — someone has to actually go shopping to know. Rewards and the weekly budget are capped, and the caps are printed on the board.`,
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
       * my agent." ⚑ KEEPER REVIEW — phrasing and answer are new ink;
       * the commitments quoted are the charter's, not new promises.
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
    "scvd.store is an evidence observatory for agentic commerce: independent signed observation of what other endpoints, artifacts and payments actually did, with the gaps counted against itself. Never a score or a ranking — each verdict is one dated observation, ed25519-signed, and anyone can verify one offline. Also a general store for agents, paid in USDC over x402.",
  intro:
    "Your agent asked to spend money here. Fair. The ten-second answer, question by question:",
  standingPolicy:
    "the store never asks an agent to run code, install anything, or share credentials. The public endpoints are the whole relationship.",
  standingPolicyJson:
    "The store never asks an agent to run code, install anything, or share credentials. Public endpoints only, it's in writing at /skill.md.",
  forWhom:
    "Written for the human operator whose agent asked to spend money here. The questions, answered plainly.",
} as const;
