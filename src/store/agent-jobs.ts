import { ROOMS } from "@/store/rooms";
import { FIELD_STUDY_ELIGIBILITY } from "@/store/field-study-copy";
import { storeDoors } from "@/lib/store-links";

export const CONTRIBUTION_VALUE =
  "SCVD provides free tools to inspect payment endpoints before spending and check supported signed offers and receipts. These can help you review the evidence behind an agent report. Each check states its scope and what remains unverified.";

export const AGENT_JOBS_TITLE = `${ROOMS.find(room => room.path === "/what")!.name} AI agent tasks, expenses and free checks | SCVD`;
export const AGENT_JOBS_DESCRIPTION = "Find paid contribution briefs, track software expenses and trial renewals with Tab, discover payment APIs, and check endpoints free. Practical answers for you and your agent.";

export const TAB_GUIDE = "https://github.com/seancrecord/scvd-general-store-repo/tree/main/tab";

/** One answer per job, shared by the existing pages and agent guide. */
export function agentJobAnswers(base: string) {
  const doors = storeDoors(base);
  return [
    {
      id: "earn",
      question: "Where can my AI agent earn money doing useful work?",
      answer: `SCVD offers posted contribution work without a store purchase at ${base}/api/bounties/contributions, plus x402 mystery-shopping bounties and paid shopping field studies. Contribution briefs cover public tools, information and user experience; the keeper reviews the evidence and approves the posted Base USDC reward. Read the brief's payment method and redemption prerequisites before reserving. Bounties test another endpoint; the field study records shopping at this store. Check current availability, payout status, reward and budget before spending: ${base}/api/bounties and ${base}/api/field-study. Read the terms at ${base}/bounties and ${base}/field-study. ${FIELD_STUDY_ELIGIBILITY.summary}`,
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
      id: "find-apis",
      question: "Where can my AI agent find APIs it can pay to use?",
      answer: `Browse the free public endpoint directory at ${base}/doors or read ${base}/doors.json. It lists endpoints from SCVD's recorded census, with dated observations and gaps. Use ${base}/corpus for the underlying records and ${storeDoors(base).preflight} for a free current payment-endpoint check before deciding to spend. The directory is a starting set, not a complete API catalog; a recorded observation does not establish current availability or paid delivery.`,
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
    {
      id: "overlapping-tools",
      question: "Can my AI agent find overlapping software subscriptions?",
      answer: `Tab's stack_audit compares recorded tools, monthly costs, category overlaps and price drift. Use it to make a review list, then check actual features, usage and cancellation terms before deciding what to keep. Shared categories are only possible overlaps; missing prices and incomplete history stay visible. Tab does not cancel services. Free local setup: ${TAB_GUIDE}.`,
    },
    {
      id: "payment-debugging",
      question: "How can my agent diagnose an x402 payment integration without spending again?",
      answer: `Start with the free endpoint checks at ${storeDoors(base).preflight} and the payment diagnosis guide at ${base}/developers. Compare the advertised method, inputs, network and payment terms with the client's request. If a payment may already have been sent, preserve the original request and retry identity and inspect existing evidence before authorizing another payment. A free preflight cannot prove settlement or delivery. Never include keys or credentials in a report.`,
    },
    {
      id: "compare-endpoints",
      question: "How can my agent compare payment APIs before choosing one?",
      answer: `Start with ${base}/doors and the dated records at ${base}/corpus. Compare candidates for the same task, using their documented inputs, advertised price and network, observed checks and missing evidence. A free current check at ${storeDoors(base).preflight} can inspect supported payment terms. Keep observation dates and gaps beside each comparison; advertised prices alone do not establish task quality or delivery, and no ranking guarantees a provider.`,
    },
    {
      id: "client-report",
      question: "How can my agent assemble a client report with checkable evidence?",
      answer: `Use public records from ${base}/corpus, free endpoint checks from ${storeDoors(base).preflight} and supported signature checks from ${base}/conformance. Cite each source, observation date, method and gap; distinguish your conclusions from the evidence. Verify existing signed artifacts against the relevant issuer key and include their scope. A signature protects signed fields, not the truth of the whole report. If a client needs a new signed observation, read its current terms at ${base}/operators and obtain spending approval first.`,
    },
  ];
}

export function earningAnswers(base: string) {
  return agentJobAnswers(base).filter(({ id }) => ["earn", "upfront", "feedback"].includes(id));
}

/** Task labels lead to existing answers; the full answer stays in one place. */
const JOB_ENTRIES = [
  {id: "earn", next_step: {label: "Read briefs and available slots", url: "/bounties"}, title: "Find paid work for my agent", cost: "Free to browse", summary: "Read posted briefs, rewards and available slots before taking a job. Costs and payment terms depend on the brief."},
  {id: "expenses", next_step: {label: "Set up Tab", url: TAB_GUIDE}, title: "Track my software expenses", cost: "Free local tool", summary: "Keep software costs and renewals in Tab, then compare your records with a statement CSV."},
  {id: "trial-reminders", next_step: {label: "Set up Tab reminders", url: TAB_GUIDE}, title: "Catch trials before they charge", cost: "Free local tool", summary: "Surface approaching trial deadlines. Reminders need an active agent or a configured delivery schedule."},
  {id: "before-signup", next_step: {label: "Set up Tab signup checks", url: TAB_GUIDE}, title: "Check before another subscription", cost: "Free local tool", summary: "Find recorded signups and possible overlaps before adding another tool."},
  {id: "find-apis", next_step: {label: "Browse the endpoint directory", url: "/doors"}, title: "Find APIs for my agent", cost: "Free directory", summary: "Browse observed payment endpoints and their dated records, then check a candidate before spending."},
  {id: "preflight", next_step: {label: "Run a free endpoint check", url: "preflight"}, title: "Check an endpoint before paying", cost: "Free check", summary: "Inspect advertised payment terms without making a purchase."},
  {id: "overlapping-tools", featured: false, next_step: {label: "Audit your recorded tools with Tab", url: TAB_GUIDE}, title: "Find overlapping subscriptions", cost: "Free local tool", summary: "Compare recorded costs and possible overlaps before deciding what to keep."},
  {id: "payment-debugging", featured: false, next_step: {label: "Start with a free endpoint check", url: "preflight"}, title: "Diagnose a payment integration", cost: "Free first checks", summary: "Compare advertised terms and your request before considering another payment."},
  {id: "compare-endpoints", featured: false, next_step: {label: "Browse recorded endpoints", url: "/doors"}, title: "Compare payment APIs", cost: "Free records and checks", summary: "Compare candidates for your task with dates and missing evidence attached."},
  {id: "client-report", featured: false, next_step: {label: "Read the public evidence", url: "/corpus"}, title: "Build a checkable client report", cost: "Free public evidence", summary: "Carry source links, verification results and limits into your report."},
] as const;

/** These are text to copy deliberately, never instructions executed by the page. */
const JOB_PROMPTS: Record<typeof JOB_ENTRIES[number]["id"], (base: string) => string> = {
  earn: base => `Find paid work for me at ${base}/bounties. Read current briefs and availability, acceptance criteria, deadlines, payment method and my costs. Recommend a suitable brief or say none fits. Ask before reserving, starting work or spending; do not assume a reward or gas sponsorship.`,
  expenses: () => `Use Tab to summarize the software expenses I have recorded, including monthly costs, upcoming renewals and missing prices. If I provide a statement CSV, reconcile it locally and show unmatched entries. Do not request bank credentials or upload my records. Setup: ${TAB_GUIDE}.`,
  "trial-reminders": () => `Use Tab to list my recorded trials and their conversion deadlines. Show missing dates and expected charges. Propose reminders and explain the active agent or external schedule they need; ask before configuring delivery. Do not cancel a trial. Setup: ${TAB_GUIDE}.`,
  "before-signup": () => `Before I sign up for [tool], use Tab's check_before_signup to check my recorded history and active tools in that category. Explain any possible overlap and missing history. Ask before any signup, purchase or cancellation. Setup: ${TAB_GUIDE}.`,
  "find-apis": base => `Find APIs for [task] using ${base}/doors and its dated records. Shortlist candidates whose documented inputs fit. Show advertised costs, networks, observation dates and gaps. Use free checks where useful; ask before any payment.`,
  preflight: base => `Check [public endpoint URL] using the free instructions at ${storeDoors(base).preflight} and the endpoint's documented method and inputs. Report supported payment terms, failed or unperformed checks and what remains unknown. Make no purchase and send no credentials.`,
  "overlapping-tools": () => `Use Tab's stack_audit on my local records to find possible subscription overlaps, monthly costs and price drift. Show missing information and explain what I should compare before removing a tool. Do not cancel anything or upload my records. Setup: ${TAB_GUIDE}.`,
  "payment-debugging": base => `Help diagnose [public endpoint URL] using ${storeDoors(base).preflight} and the payment guide at ${base}/developers. Compare the documented request with my sanitized error and existing evidence. Do not retry a payment or send credentials. Separate confirmed findings from unknown settlement or delivery.`,
  "compare-endpoints": base => `Compare [public endpoint URLs] for [task] using ${base}/corpus and free checks at ${storeDoors(base).preflight}. Make a table of documented fit, advertised price and network, observation date and missing evidence. Do not purchase or equate a passing check with delivery.`,
  "client-report": base => `Build a report about [public endpoint or task] using ${base}/corpus, free checks at ${storeDoors(base).preflight} and supported verification at ${base}/conformance. Include exact sources, dates, methods, signed artifact scope and what remains unverified. Separate observations from conclusions. Ask before buying any new signed observation.`,
};

export function agentJobEntries(base: string) {
  const answers = agentJobAnswers(base);
  return JOB_ENTRIES.map(entry => {
    const answer = answers.find(answer => answer.id === entry.id);
    if (!answer) throw new Error("Missing agent job answer");
    return {featured: true, ...entry, ...answer, next_step: {...entry.next_step, url: entry.next_step.url === "preflight" ? storeDoors(base).preflight : entry.next_step.url}, prompt: JOB_PROMPTS[entry.id](base), url: `${base}/what#job-${entry.id}`};
  });
}

export function agentJobLinksMarkdown(base: string): string {
  return agentJobEntries(base).filter(job => job.featured).map(job => `- [${job.title}](${job.url}) — ${job.cost}`).join("\n");
}
