import { DEFAULT_MAX_AMOUNT_PER_PAYMENT } from "@x402/core/client";

/**
 * THE CAP THE BUYER'S OWN CLIENT APPLIES, AND WHY WE SAY IT OUT LOUD.
 *
 * Verified in the installed SDK 2026-08-25, @x402/core 2.23.0,
 * dist/esm/client/index.mjs: `DEFAULT_MAX_AMOUNT_PER_PAYMENT = "$1"`
 * at :22; `this.spendControls = {}` at :34, which is ON by default —
 * only `spendControls: false` turns it off; the usd limit falls back
 * to that default at :490; and :542 THROWS once every accept has been
 * filtered out. `applySpendControls` runs INSIDE
 * `selectPaymentRequirements`, BEFORE the accept is picked. So a
 * stock v2 client refuses to sign anything over the cap on the
 * buyer's own machine, before a signature exists.
 *
 * WHAT THAT COSTS US IS INVISIBILITY, WHICH IS THE POINT OF THIS
 * FILE. We issue the challenge and record it. No signature ever
 * arrives, so there is no decline to record either. On our side the
 * shape is identical to a buyer who looked and wandered off — thirteen
 * of twenty-four priced doors and every commission rung, all reading
 * as apathy when some of it is a safety control doing its job.
 *
 * THE FIX IS DISCLOSURE, NOT EVASION. The keeper's ruling of
 * 2026-08-25 is explicit that an npm which splits one $20 charge into
 * twenty-one sub-$1 charges was considered and REJECTED: the cap
 * exists so an agent cannot spend its operator's money unsupervised,
 * and a library whose job is to route around it defeats a safety
 * control on the BUYER's side, shipped by us. For a store whose
 * product is evidence and trust that is an own goal. It also invents
 * a distributed transaction we have no escrow to unwind — twenty-one
 * payments is twenty-one nonces, and the fourteenth failing leaves a
 * half-paid purchase.
 *
 * So the store tells the buyer, in the response they are already
 * reading, what their own client is about to do and how to answer it.
 * The three legitimate answers stay the buyer's: raise the limit,
 * disable spend controls deliberately, or don't buy.
 *
 * THE NUMBER IS IMPORTED, NEVER RETYPED. Every sentence this store
 * publishes about the cap derives from the constant the client
 * package itself exports, so our copy cannot disagree with the client
 * it describes except by being out of date in lockstep with it. The
 * spec asserts exactly that, which is what makes the disclosure worth
 * reading rather than another number to distrust.
 */

/** The cap as the client package writes it, e.g. "$1". */
export const CLIENT_CAP_LABEL = String(DEFAULT_MAX_AMOUNT_PER_PAYMENT);

/**
 * The cap in dollars. `NaN` if the package ever ships a shape this
 * cannot read — every caller checks `CLIENT_CAP_READABLE` first,
 * because a cap we cannot parse must make us say nothing rather than
 * say a wrong number (rule 52: a lookup that cannot see everything
 * must not answer "no").
 */
export const CLIENT_CAP_USD = Number(CLIENT_CAP_LABEL.replace(/[^\d.]/g, ""));

/** Whether the imported cap is legible as an amount at all. */
export const CLIENT_CAP_READABLE =
  Number.isFinite(CLIENT_CAP_USD) && CLIENT_CAP_USD > 0;

/** How a door's own prices stand against the buyer's default ceiling. */
export interface CapReading {
  /** The cheapest thing a buyer can pay here. */
  cheapestUsd: number;
  /** How many of the door's tiers sit above the cap. */
  tiersAboveCap: number;
  /** Every tier is above the cap: a stock client throws, unsigned. */
  blocked: boolean;
  /**
   * Some tiers are above and at least one is not. Nothing throws —
   * the client quietly picks a cheaper accept — so the door still
   * sells, but a buyer who meant to pay more silently cannot. Worth
   * saying; not worth alarming anyone about.
   */
  tipCapped: boolean;
}

/**
 * Read a door's tier list against the cap. Tiers come from
 * `priceTiersUsdc`, which derives them from the item — this function
 * never sees a typed price and never holds one.
 */
export function readAgainstCap(tiersUsd: readonly number[]): CapReading | null {
  if (!CLIENT_CAP_READABLE || tiersUsd.length === 0) {
    return null;
  }
  const above = tiersUsd.filter((tier) => tier > CLIENT_CAP_USD);
  return {
    cheapestUsd: Math.min(...tiersUsd),
    tiersAboveCap: above.length,
    blocked: above.length === tiersUsd.length,
    tipCapped: above.length > 0 && above.length < tiersUsd.length,
  };
}

/**
 * The sentence a blocked door puts in its own 402, addressed to the
 * client that is about to refuse it. Written to be actionable in one
 * read: what is about to happen, where, and the two settings that
 * answer it — plus the plain statement that we cannot see the
 * refusal, which is why we are mentioning it unprompted.
 */
export function blockedDoorNotice(cheapestUsd: number): string {
  return (
    `Heads up before you spend a round trip on this: the stock x402 ` +
    `client (@x402/core) applies a default ceiling of ` +
    `${CLIENT_CAP_LABEL} per payment, and it applies it inside ` +
    `selectPaymentRequirements BEFORE choosing an accept — so an ` +
    `unconfigured client THROWS here, on your machine, without ever ` +
    `signing. The cheapest accept at this door is $${cheapestUsd}. ` +
    `If that is you: raise maxAmountPerPayment above $${cheapestUsd}, ` +
    `or pass spendControls: false if you mean to. We mention it ` +
    `unprompted because the refusal happens entirely on your side — ` +
    `we see a request for the price and then nothing, which looks ` +
    `exactly like you changed your mind. The ceiling is your ` +
    `operator's safety control and we are not routing around it.`
  );
}

/** The softer case: the door sells, but the upper tiers are unreachable. */
export function tipCappedNotice(tiersAboveCap: number): string {
  return (
    `${tiersAboveCap} of this door's price tiers sit above the stock ` +
    `x402 client's default ${CLIENT_CAP_LABEL} per-payment ceiling. ` +
    `Nothing breaks — an unconfigured client simply takes a cheaper ` +
    `accept — but if you meant to pay one of the higher tiers you ` +
    `will need to raise maxAmountPerPayment first.`
  );
}
