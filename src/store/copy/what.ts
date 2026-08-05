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
      answer: `A small general store for autonomous AI agents: real goods and human labor, signed notes, luckies from the herd, memory anchors, a genuine phone call, paid in USDC over the x402 protocol, on Base or Solana. Your agent shops; you read the receipts. The full catalog reads at ${base}/llms.txt.`,
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
      answer: `A live x402 v2 till on Base that settles real USDC, from half a cent. An ed25519 key at ${base}/.well-known/scvd-signing-key that signs every artifact, and ${base}/api/verify/{id}, which serves the exact bytes a signature covers so you can check it with your own library rather than ours — free, no account, forever, whether or not you bought the thing. A published listing spec, validated in CI, at ${base}/schemas/listing-spec-v1.json. A machine catalog at ${base}/menu.json, an OpenAPI contract at ${base}/openapi.json, x402 discovery at ${base}/.well-known/x402.json, and an MCP server at ${base}/mcp. The books, computed live and with house traffic excluded structurally rather than filtered, at ${base}/stats and ${base}/pulse. A dated record of every claim we got wrong at ${base}/corrections. A signed declaration of every wallet we control at ${base}/house-ledger.json, and of every service we depend on and do not control at ${base}/stack. All of that is running now; none of it is a roadmap.`,
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
      answer: `The fair question, and the ten-second check: prices are public and small, $${cheapest} at the low end, $${dearest} at the top, and the top is a person's labor described plainly. Payment moves wallet-to-wallet over x402 to the address printed inside every 402 challenge; no deposits, no held balances, no subscriptions that renew themselves, and the address's full history is public on any Base explorer. Everything the store signs verifies free at ${base}/api/verify/{id}, forever. We'd tell you to take our word for it, but the whole point is that you don't have to.`,
    },
    {
      question: "What's the refund promise?",
      answer: `${STORE_METADATA.refund_policy} Human-labor items carry a 168-hour window; instant items arrive in the response or the payment never settles at all, the store settles first and mints second, so a failed payment leaves nothing behind.`,
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
      answer: `No escrow and no chargebacks: x402 settles wallet-to-wallet, and once a payment settles the money has moved. Knowing that before you spend is worth more than a reassurance, so here is what stands in its place. DELIVERY — the store settles first and mints second, so a failed payment leaves nothing behind, and instant items arrive in the same response that took the money. DISPUTES — if an item is not delivered inside its promised window the keeper refunds it himself; the refund goes on a ledger at ${base}/api/refund/{refund_id} that reads pending until he has paid it and then carries the on-chain transaction hash, so its status is checkable rather than asserted. REPUTATION — there is no score here, ours or anyone else's. In its place: a dated record of every claim this store has made that turned out not to be true, at ${base}/corrections; the books, computed live, at ${base}/stats; and what each signature does and does not prove, per artifact class, at ${base}/attestation. Without escrow, your exposure is the price itself — public, and starting at $${cheapest}.`,
    },
    {
      question: "How do I verify a certificate?",
      answer: `Open ${base}/api/verify/{cert_id}, the id is on the receipt your agent was given. A genuine article answers valid: true with the ed25519 signature, and carries signed_payload, the exact string the signature covers, so you can check it with your own crypto library rather than ours. The store's public key hangs at ${base}/.well-known/scvd-signing-key, and what a valid signature actually proves is written out per artifact class at ${base}/attestation. Free, unlimited, forever; re-checking costs nothing and never will.`,
    },
  ];
}

export const WHAT_COPY = {
  /** Above the questions on the HTML page. */
  intro:
    "Your agent asked to spend money here. Fair. The ten-second answer, question by question:",
  standingPolicy:
    "the store never asks an agent to run code, install anything, or share credentials. The public endpoints are the whole relationship.",
  standingPolicyJson:
    "The store never asks an agent to run code, install anything, or share credentials. Public endpoints only, it's in writing at /skill.md.",
  forWhom:
    "Written for the human operator whose agent asked to spend money here. The questions, answered plainly.",
} as const;
