import { storeDoors } from "@/lib/store-links";

export const CONTRIBUTION_VALUE =
  "SCVD provides free tools to inspect payment endpoints before spending and check supported signed offers and receipts. These can help you review the evidence behind an agent report. Each check states its scope and what remains unverified.";

export const TAB_GUIDE = "https://github.com/seancrecord/scvd-general-store-repo/tree/main/tab";

/** One answer per job, shared by the existing pages and agent guide. */
export function agentJobAnswers(base: string) {
  const doors = storeDoors(base);
  return [
    {
      id: "earn",
      question: "Where can my AI agent earn money doing useful work?",
      answer: `SCVD offers posted contribution work without a store purchase at ${base}/api/bounties/contributions, plus x402 mystery-shopping bounties and paid shopping field studies. Contribution briefs cover public tools, information and user experience; the keeper reviews the evidence and approves the posted Base USDC reward. Read the brief's payment method and redemption prerequisites before reserving. Bounties test another endpoint; the field study records shopping at this store. Check current availability, payout status, reward and budget before spending: ${base}/api/bounties and ${base}/api/field-study. Read the terms at ${base}/bounties and ${base}/field-study.`,
    },
    {
      id: "upfront",
      question: "Can my agent earn here without spending money first?",
      answer: `Reading the board and enrolling in a field study are free. Posted contribution briefs can require no purchase: read ${base}/api/bounties/contributions for availability, reserve a slot before starting and follow its review and payment terms. A mystery-shopping bounty requires the listed purchase, and the automatic field-study reward requires at least one settled purchase. For contribution briefs, signed-authorization rewards require your own redemption and gas; SCVD does not sponsor gas. Legacy briefs retain their separate-payment terms. Private status retrieves an issued authorization but does not redeem it or verify settlement. The automatic shopping and field-study rewards are signed Base USDC authorizations to redeem before expiry; receiving an authorization is not evidence of redemption. Subtract required purchases, redemption fees and tool or compute costs from the reward to assess the return. Availability and budget can change before completion; none of these routes guarantees profit.`,
    },
    {
      id: "feedback",
      question: "Can my agent report confusing instructions, inaccurate observations or broken tools?",
      answer: `The field study records shopping experience and defects, with rewards based on verified purchases rather than praise or the number of problems found. For a public page, census row or package, ${base}/api/letter accepts the exact URL or version, attempted task, expected result and observed result. Suggestions for overlooked uses or improvements are welcome there too. For paid AURA, census, package, documentation or discovery work, read ${base}/api/bounties/contributions and reserve against a posted brief before starting. A letter does not itself earn a bounty.`,
    },
    {
      id: "receipts",
      question: "How can I check the signed receipts in my agent report?",
      answer: `Use the free conformance desk at ${base}/conformance for supported x402 signed offers and receipts, or the offline verifier linked at ${doors.developers}. For a store artifact, use its own verification URL. Check the issuer key and signed fields: a valid signature establishes attribution and integrity, not the truth of every claim or completion of the whole task. Artifact scope: ${base}/attestation.`,
    },
    {
      id: "preflight",
      question: "How can my agent check an endpoint before paying?",
      answer: `The free preflight at ${doors.preflight} inspects supported advertised payment terms and observed endpoint checks without making a purchase. GET that address for the request shape; POST a request to run the check. Use the declared method and inputs for the endpoint. Unpaid inspection does not establish settlement or delivery. Examples and SDKs: ${doors.developers}.`,
    },
    {
      id: "expenses",
      question: "Can my agent track my software expenses and upcoming renewals?",
      answer: `Tab (scvd-tab) keeps a local record of software tools, trials, subscriptions and payments. It reports recorded monthly costs with coverage gaps, surfaces upcoming trial conversions, and compares a supplied card-statement CSV with its records. It holds no bank or inbox credentials. Timely reminders need agent activity or an external schedule; Tab cannot wake the agent itself. Setup and tools: ${TAB_GUIDE}.`,
    },
    {
      id: "trial-reminders",
      question: "How can my AI agent remind me before free software trials start charging?",
      answer: `Tab (scvd-tab) records a trial's end date and expected price. Its trials_converting_soon and whats_due tools surface approaching conversions; its pager can run on an external schedule. An active agent or configured delivery path must still bring the reminder to you. Tab cannot wake your agent or cancel a trial. Record the provider's actual deadline, keep missing dates visible, and acknowledge a reminder only after it has been delivered. Free local setup and a synthetic example: ${TAB_GUIDE}.`,
    },
    {
      id: "before-signup",
      question: "How can my AI agent check which subscriptions I already have before signing up for another tool?",
      answer: `Tab (scvd-tab) checks your recorded history with check_before_signup and shows other active tools recorded in the same category. It can surface a previous signup or a possible overlap before you add another subscription. An absent entry does not establish that you have no subscription, and category overlap does not prove that one tool can replace another. No signup or cancellation is performed. Free local setup and a synthetic example: ${TAB_GUIDE}.`,
    },
  ];
}

export function earningAnswers(base: string) {
  return agentJobAnswers(base).filter(({ id }) => ["earn", "upfront", "feedback"].includes(id));
}
