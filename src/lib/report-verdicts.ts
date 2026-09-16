import type { GoodBuyerObservation } from "@/services/good-buyer";
import type { LaunchCheckVerdict } from "@/services/launch-check";
import type { OnpageAuditObservation } from "@/services/onpage-audit";
import type { ServiceAuditObservation } from "@/services/service-audit";
import type { ReconciliationVerdict } from "@/services/settlement-reconciliation";

// Exhaustive records make a new instrument outcome a typecheck failure until
// its contract is updated. The enum is derived from those checked keys.
function verdictSchema(outcomes: Record<string, true>) {
  return { type: "string", enum: Object.keys(outcomes) };
}

const auditOutcomes = {
  ready: true,
  not_ready: true,
  unreachable: true,
  refused: true,
  /*
   * 2026-09-16. NOT shared with the onpage audit below, which reads
   * HTML pages with a GET that is always the right verb — hence the
   * two records split here rather than one being reused for both.
   * An exhaustive record is only worth having if it is allowed to
   * stop matching.
   */
  method_unresolved: true,
} satisfies Record<ServiceAuditObservation["verdict"], true>;

export const AUDIT_REPORT_VERDICT = verdictSchema(auditOutcomes);
export const ONPAGE_REPORT_VERDICT = verdictSchema({
  ready: true,
  not_ready: true,
  unreachable: true,
  refused: true,
} satisfies Record<OnpageAuditObservation["verdict"], true>);

export const GOOD_BUYER_REPORT_VERDICT = verdictSchema({
  would_sign: true,
  would_throw: true,
  cannot_simulate: true,
  unreachable: true,
  refused: true,
} satisfies Record<GoodBuyerObservation["verdict"], true>);

export const LAUNCH_REPORT_VERDICT = verdictSchema({
  settled: true,
  payment_refused: true,
  no_payment_gate: true,
  malformed_challenge: true,
  unpaid_by_rule: true,
  unreachable: true,
} satisfies Record<LaunchCheckVerdict, true>);

export const RECONCILIATION_REPORT_VERDICT = verdictSchema({
  no_settlement: true,
  no_discretion: true,
  within_cap: true,
  over_cap: true,
  cap_not_observable: true,
} satisfies Record<ReconciliationVerdict, true>);
