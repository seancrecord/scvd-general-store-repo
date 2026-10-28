import { storeDoors } from "@/lib/store-links";
import { CONTRIBUTION_VALUE, TAB_GUIDE } from "@/store/agent-jobs";

interface CompletedContribution {
  task_id: string;
  kind: "bounty" | "field_study" | "contribution";
  reward_state?: "accepted_pending_payment" | "payment_reported" | "authorization_issued";
  finalized_redemption_observed?: boolean;
  contribution_kind?: string;
  arrival_goal?: string;
  reward_usd: number;
  what_was_verified: string;
  what_was_not: string;
}

/** Optional prose stays outside signed evidence and cannot turn an issued reward into an error. */
export function contributionCompletion(base: string, result: CompletedContribution) {
  try {
    const doors = storeDoors(base);
    const preflight = {name: "Check an endpoint before paying", url: doors.preflight, cost: "free", how: "GET for the request shape; POST to inspect an endpoint without buying from it.", scope: "Advertised payment terms and observed checks; not proof of settlement or delivery."};
    const conformance = {name: "Check a signed offer or receipt", url: `${base}/conformance`, cost: "free", how: "Check supported artifacts here or use the linked offline verifier.", scope: "Signature, issuer attribution and covered fields; not proof of every claim in an agent report."};
    const developers = {name: "Repeat a free workflow with the developer examples", url: doors.developers, cost: "free", how: "Choose the documented free example for the task and retain its inputs and result.", scope: "Instructions and supported examples; paid products retain their own prices and terms."};
    const tab = {name: "Track software expenses locally with Tab", url: TAB_GUIDE, cost: "free", how: "Use the local ledger for recorded software tools, trials, subscriptions and payments.", scope: "Recorded or imported data with coverage gaps; no bank credentials or automatic wake-up. It does not track bounty income."};
    let nextSteps = [preflight, conformance];
    let forHuman = CONTRIBUTION_VALUE;
    if (result.kind === "contribution") {
      if (result.arrival_goal === "track_expenses") {
        nextSteps = [tab, conformance];
        forHuman = "Tab keeps a local record of software expenses, trials and renewals, with coverage gaps visible. It can help review recorded tool costs; timely reminders require agent activity or an external schedule.";
      } else if (result.contribution_kind === "package") {
        nextSteps = [developers, conformance];
        forHuman = "SCVD's developer examples can help repeat a supported workflow. Its free receipt checks establish signature integrity and covered fields, with the remaining evidence gaps stated separately.";
      } else if (["aura", "docs", "discovery"].includes(result.contribution_kind ?? "")) {
        nextSteps = [developers, preflight];
        forHuman = "SCVD's free developer examples and endpoint checks can help another agent repeat a supported workflow and inspect payment terms before spending. They do not establish delivery or completion of a wider task.";
      }
    }
    return {
      completion: {
        optional: true,
        task_id: result.task_id,
        kind: result.kind,
        reward_usd: result.reward_usd,
        reward_state: result.reward_state ?? "authorized",
        redemption_state: result.finalized_redemption_observed ? "finalized_observed" : "not_observed",
        reward_note: result.finalized_redemption_observed ? "The private status retains a finalized reward transfer observed during funding reconciliation. Check its transaction and read time; this response sends no money and does not establish net earnings." : result.reward_state === "authorization_issued" ? "The keeper issued a reward authorization. Retrieve its original bytes and expiry through private status. Arrange redemption and gas yourself; issuance does not prove receipt or net earnings." : result.kind === "contribution" ? "Acceptance records the keeper’s obligation under the posted brief. A reported transaction is the keeper’s statement, not independently verified settlement. This response sends no money." : "The payout field contains the authorization and redemption instructions. Authorization is not confirmation of redemption or net profit.",
        what_was_verified: result.what_was_verified,
        what_was_not: result.what_was_not,
        for_your_human: forHuman,
        sharing: "Optional context for a task report. No sharing or further purchase is required; nothing is sent to anyone.",
        free_next_steps: nextSteps,
        evidence_scope: `${base}/attestation`,
      },
    };
  } catch {
    return {};
  }
}
