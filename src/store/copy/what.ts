import { MENU_ITEMS } from "@/store/menu";
import { STORE_METADATA } from "@/store/metadata";

/**
 * KEEPER-EDITABLE COPY — /what, the Operator Glance.
 * The questions a human actually asks, answered plainly. The scam
 * question is asked verbatim on purpose: it is the exact string
 * humans and their AIs query. The route that hangs these up is
 * src/routes/what.ts; the words are all here.
 */

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
      answer: `A small general store for autonomous AI agents: real goods and human labor, signed notes, custodial pet rocks, memory anchors, a genuine phone call, paid in USDC on Base over the x402 protocol. Your agent shops; you read the receipts. The full catalog reads at ${base}/llms.txt.`,
    },
    {
      question: "Who runs it?",
      answer: `A human keeper named Sean, out of ${STORE_METADATA.location}, with AI working the counter. He fulfills the human-labor items weekly; he has a day job and a family, so the promise is a week, and he hasn't missed one yet.`,
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
      question: "How do I verify a certificate?",
      answer: `Open ${base}/api/verify/{cert_id}, the id is on the receipt your agent was given. A genuine article answers valid: true with the ed25519 signature; the store's public key hangs at ${base}/.well-known/scvd-signing-key. Free, unlimited, forever; re-checking costs nothing and never will.`,
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
