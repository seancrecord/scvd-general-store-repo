/**
 * THE CHECKOUT LIFECYCLE, AND THE ONE STATE THAT KEEPS BEING MISUSED.
 *
 * The statuses are the specification's, not this store's:
 * shopping/checkout.json enumerates incomplete, requires_escalation,
 * ready_for_complete, complete_in_progress, completed and canceled.
 *
 * `complete_in_progress` MEANS THE COMPLETE CALL IS STILL BEING
 * PROCESSED. It does not mean "the thing you bought is still being
 * made". The first draft of this store's plan had The Aura Walk
 * sitting in it for the seven days of its delivery promise, which
 * would have told every platform that a paid, settled, confirmed
 * purchase was still an unfinished transaction for a week. Once the
 * money is confirmed the checkout is `completed` and carries its
 * order; how long the keeper then takes belongs to the Order's
 * fulfillment, which the specification expects to keep changing after
 * placement.
 *
 * WHAT IT IS FOR is the row in the failure matrix nothing else covers:
 * settlement attempted, outcome UNKNOWN. Not declined — unknown. There
 * the store cannot say "paid" and must not say "not paid", so the
 * checkout stays in progress and reconciliation decides. A platform is
 * expected to poll Get Checkout rather than call Complete again.
 */
export const CHECKOUT_STATUSES = [
  "incomplete",
  "requires_escalation",
  "ready_for_complete",
  "complete_in_progress",
  "completed",
  "canceled",
] as const;

export type CheckoutStatus = (typeof CHECKOUT_STATUSES)[number];

/** Nothing leaves these. A terminal checkout is a finished fact. */
export const TERMINAL_CHECKOUT_STATUSES = ["completed", "canceled"] as const;

export function isTerminal(status: CheckoutStatus): boolean {
  return (TERMINAL_CHECKOUT_STATUSES as readonly string[]).includes(status);
}

/**
 * The transitions this store actually performs, written as data so a
 * new one has to be added here rather than appearing in a handler.
 *
 * `completed` is reachable only from `complete_in_progress`, never
 * directly from `ready_for_complete`: every completion passes through
 * the state that says a Complete call is being processed, even when
 * the processing is fast. A checkout that jumped straight to completed
 * would have no state in which a crash mid-settlement is legible.
 */
const ALLOWED: Readonly<Record<CheckoutStatus, readonly CheckoutStatus[]>> = {
  incomplete: ["incomplete", "ready_for_complete", "requires_escalation", "canceled"],
  requires_escalation: ["incomplete", "ready_for_complete", "canceled"],
  ready_for_complete: [
    "incomplete",
    "ready_for_complete",
    "complete_in_progress",
    "requires_escalation",
    "canceled",
  ],
  // Back to ready_for_complete when settlement DECLINED: the money did
  // not move, so the buyer may sign again against the same terms.
  complete_in_progress: ["complete_in_progress", "completed", "ready_for_complete", "canceled"],
  completed: [],
  canceled: [],
};

export function canTransition(from: CheckoutStatus, to: CheckoutStatus): boolean {
  return (ALLOWED[from] ?? []).includes(to);
}

export class InvalidCheckoutTransition extends Error {
  constructor(
    readonly from: CheckoutStatus,
    readonly to: CheckoutStatus,
  ) {
    super(
      isTerminal(from)
        ? `Checkout is ${from} and cannot become ${to}: a terminal checkout is a finished fact.`
        : `Checkout cannot go from ${from} to ${to}.`,
    );
    this.name = "InvalidCheckoutTransition";
  }
}

export function assertTransition(from: CheckoutStatus, to: CheckoutStatus): void {
  if (!canTransition(from, to)) throw new InvalidCheckoutTransition(from, to);
}

/**
 * WHAT `expires_at` GOVERNS, decided rather than left implicit.
 *
 * The specification defaults a checkout to six hours. This store sends
 * a shorter one, because a checkout here can hold a reservation
 * against a weekly ceiling of two or five — six hours of a stranger's
 * unfinished intent is most of a working day of a one-person shop's
 * capacity held by nobody.
 *
 * THE BOUNDARY IS THE COMPLETE CALL ARRIVING, not the transfer landing
 * and not finality being reached. The buyer controls when they call;
 * they do not control how long a chain takes, and expiring a checkout
 * because a rail was slow would refuse a purchase for something the
 * buyer did right. Once Complete is accepted inside the window, the
 * checkout is being processed and the clock stops mattering.
 *
 * The one case this leaves open is real and is handled elsewhere: a
 * transfer that lands after the window against a checkout that already
 * expired. That is money the store may have received and cannot
 * credit, so it belongs in the settlement reconciliation record rather
 * than in a status field — see the failure matrix in the checkout
 * tests.
 */
export const CHECKOUT_TTL_SECONDS = 30 * 60;

export function checkoutExpiry(createdAtMs: number): string {
  return new Date(createdAtMs + CHECKOUT_TTL_SECONDS * 1000).toISOString();
}

export function isExpired(expiresAt: string, nowMs: number): boolean {
  const at = Date.parse(expiresAt);
  return Number.isFinite(at) && nowMs >= at;
}
