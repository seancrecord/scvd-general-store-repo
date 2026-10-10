import { AURA_WALK_TITLE, AURA_WALK_WHY, AURA_WALK_OUTCOME } from "@/store/aura-walk";
import { PILOT_PROPOSITION } from "@/store/evidence-pilot";

/** Editorial relationships, not a ranking or a requirement to buy another item. */
export const OFFER_PATHS = [
  {
    id: "shopping-audit", item_id: "aura_walk", title: AURA_WALK_TITLE,
    when: "You run an x402 endpoint and need to see whether unfamiliar agents can find, understand and shop it.",
    why: AURA_WALK_WHY, outcome: AURA_WALK_OUTCOME,
    limits: "Counts and transcripts, never a grade. The report does not include implementing fixes or promise more sales; unsuccessful attempts remain in the report.",
    next_label: "See audit scope and order",
  },
  {
    id: "endpoint-watch", item_id: "standing_watch", title: "Watch your endpoint after a change",
    when: "You operate the endpoint and a single reading is not enough to see what changes after deployment.",
    why: "Build a dated record of challenge shape and payment-destination changes that one spot check cannot show.",
    outcome: "Signed observations throughout the purchased term, with timestamps, payment destinations and missed observations visible in the public history.",
    limits: "Sampled public challenge checks; no purchases, delivery guarantee or continuous-uptime claim. Only submit your own public endpoint.",
    next_label: "See watch scope and order",
  },
  {
    id: "review-report", title: "Evidence report for a customer review",
    when: "A customer or internal reviewer needs a shareable record of what your public payment endpoint did over time.",
    why: "Give the reviewer a report with independently checkable observations and visible gaps instead of asking them to assemble raw history.",
    outcome: PILOT_PROPOSITION,
    limits: "One authorized public endpoint; daily samples, not continuous monitoring. No inspection of private agent decisions, compliance certification or real-time alerts.",
    next_label: "See sample report and request a pilot",
  },
  {
    id: "custom-review", title: "Scope a platform or agency review",
    when: "Your release or client decision spans several endpoints or entry points and does not fit a single shelf item.",
    why: "Agree the question, evidence and delivery window before paying for work whose scope is still unclear.",
    outcome: "A proposed brief and keeper quote defining the deliverable and delivery window, or a decline with a reason.",
    limits: "A request is not an accepted engagement. No implementation, monitoring, certification or additional protocol coverage is promised until explicitly included in the agreed scope. A declined brief excerpt and decline reason are public; contacts are private.",
    next_label: "Send a brief",
  },
] as const;

const RELATED: Readonly<Record<string, readonly string[]>> = {
  spot_check: ["endpoint-watch"], change_check: ["endpoint-watch"],
  batch_spot_check: ["custom-review"], research_comparison: ["custom-review"],
  service_audit: ["shopping-audit"], onpage_audit: ["shopping-audit"],
  launch_check: ["shopping-audit"], opening_day: ["shopping-audit"],
  aura_walk: ["custom-review"], standing_watch: ["review-report"],
  conformance_watch: ["review-report"], operator_statement: ["review-report"],
};

/** A named hop keeps compact catalogs small; full scope and prices live at that hop. */
export function relatedOfferPaths(itemId: string, base: string) {
  return (RELATED[itemId] ?? []).map(id => {
    const offer = OFFER_PATHS.find(row => row.id === id)!;
    return { title: offer.title, when: offer.when, url: `${base}/operators#${id}` };
  });
}
