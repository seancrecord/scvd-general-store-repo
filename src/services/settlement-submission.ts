/**
 * WHO IS ALLOWED TO LEAVE THE BUILDING WITH THIS PAYMENT.
 *
 * Global purchase ownership stops two protocols buying the same
 * authorization. It does not stop two executions that BOTH legitimately
 * recovered that same owned purchase from each calling the facilitator
 * at once. Ownership answers "whose payment is this"; it never answered
 * "who is submitting it right now", and until this file nothing did.
 *
 * So the purchase record gains a second, narrower lifecycle beside its
 * state, rather than overloading it:
 *
 *   unclaimed -> submission_started -> confirmed | declined | unknown
 *
 * The claim is taken inside the purchase Durable Object's own
 * transaction, against the same record that proves ownership, and it is
 * taken BEFORE any outbound request. Exactly one execution is told it
 * won. Every other execution is told `already_started` and must watch
 * rather than submit.
 *
 * THERE IS NO LEASE AND NO TIMEOUT, and that is deliberate.
 *
 * A claim that expired and re-granted itself would be a mechanism for
 * submitting the same payment twice, wearing the costume of a
 * reliability feature. The honest hazard is real and unavoidable: an
 * execution can persist `submission_started` and die one instruction
 * before the request leaves, and no local state can distinguish that
 * from a request that went out and was answered. Both look identical
 * from in here.
 *
 * The safe direction is therefore the only direction. A claim whose
 * execution disappeared resolves to `unknown` and goes to
 * reconciliation, which is the same treatment this store already gives
 * an ambiguous settle — an obligation retained until something
 * authoritative says otherwise. Only a definitive answer may release
 * it. Nothing here ever reopens a payment on the strength of a clock.
 */

export type SubmissionOutcome = "confirmed" | "declined" | "unknown";

export interface SettlementSubmission {
  /** The settlement identity this claim belongs to. */
  purchase_id: string;
  /** Binds the claim to the request that took ownership. */
  request_digest: string;
  /** Which door's execution holds it, for the record rather than for access. */
  door: string;
  claimed_at: string;
  outcome?: SubmissionOutcome;
  resolved_at?: string;
  /** Present when an ambiguous outcome was handed to reconciliation. */
  reconciliation_reference?: string;
}

export type SubmissionClaim =
  | { won: true; submission: SettlementSubmission }
  | {
      won: false;
      reason: "already_started" | "already_resolved" | "not_owned" | "wrong_request";
      submission?: SettlementSubmission;
    };

/** The storage row, one per purchase Durable Object instance. */
export const SUBMISSION_ROW = "settlement:submission";
