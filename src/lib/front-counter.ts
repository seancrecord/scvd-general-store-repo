import { buyInputSchema } from "@/lib/bazaar-discovery";
import { MENU_ITEMS } from "@/store";
import type { MenuItem } from "@/types";

/**
 * THE FRONT COUNTER — the shelf by the register, for a caller that
 * cannot afford to think.
 *
 * WHY IT EXISTS. The barbell routes cheap items to cheap models by its
 * own economics, so the sub-dollar half of the shelf is the volume
 * case rather than an edge case. Those are exactly the models that
 * cannot recover from ambiguity: they do not resolve a schema
 * conditional to find a required field, they do not hedge before a
 * failure, and there is no second attempt because nothing about this
 * store is memorable enough to justify troubleshooting. The burden
 * therefore sits on the design (AGENT_UX.md).
 *
 * THE FIX IS NOT FLATTENING THE STORE. The credibility architecture —
 * key handover history, the anchored log, attestation tiers, the
 * conformance desk, the corrections record — is the actual moat and
 * nothing here shrinks it. This is progressive disclosure: a narrow
 * front door where success is guaranteed on the first attempt, with
 * the deep machinery one hop behind rather than mandatory reading.
 *
 * DERIVED, NEVER CURATED, and that decision has evidence behind it
 * from the day it was made. A hand-picked list of "simple items" was
 * drafted and was wrong in BOTH directions on its first outing: it
 * included the_drawer, which is human_queue and fails outright, and
 * omitted recurring_patronage, which passes every stated rule. Two
 * lists that must agree with nothing checking them is the defect this
 * codebase closed three separate times on 2026-08-02 — the schema
 * against its own example, the naming law against its surfaces, the
 * id-keyed guards against the shelf. A curated lite tier would have
 * been the fourth.
 *
 * So the shelf classifies itself. Reprice an item and it moves. Add an
 * input and it drops out. Nobody has to remember.
 */

/**
 * Inputs every item accepts, which say nothing about complexity:
 * a name to put on the certificate, and a callback for the queue.
 */
/**
 * The inputs EVERY item carries and that carry no state: a name to
 * sign as, a webhook to hear back on, and — since 2026-09-04, when it
 * was declared where the other inputs are — the buyer's own statement
 * of purpose, signed verbatim onto the certificate. None of the three
 * is a branch: a caller that sends none of them gets the same goods.
 */
export const UNIVERSAL_INPUTS: ReadonlySet<string> = new Set([
  "agent_name",
  "callback_url",
  "purpose",
]);

export interface FrontCounterVerdict {
  eligible: boolean;
  /** Every rule this item breaks, named. Empty when eligible. */
  fails: string[];
}

/**
 * THE FOUR RULES, and the reasoning for each is what keeps somebody
 * from "simplifying" one away later.
 */
export function frontCounterVerdict(item: MenuItem): FrontCounterVerdict {
  const fails: string[] = [];

  /**
   * ONE PRICE. A tier choice is a decision branch even when no field
   * is required — nomenclature has no inputs at all and still asks the
   * caller to pick between three amounts before it can sign anything.
   */
  if (item.pricing !== "fixed") {
    fails.push(
      "pay-what-it-deserves: choosing between offered amounts is a decision branch before the first call",
    );
  }

  /**
   * NO INPUTS BEYOND THE UNIVERSAL TWO — required OR optional, and the
   * optional half is the part worth explaining.
   *
   * Required fields are the obvious disqualifier: they live in an
   * allOf/if/then branch, and an agent better at prose than at schema
   * conditionals learns about them by eating a 400.
   *
   * OPTIONAL fields disqualify for a different reason, and
   * recurring_patronage is the whole case. It is fixed-price, instant
   * and requires nothing — and it takes an optional `pass_id` to
   * extend an existing pass rather than start a new one. That means
   * the artifact is STATEFUL: a buyer using it as intended has to
   * remember a pass id and decide "extend or start fresh" on every
   * later purchase. Same failure as an order_id to poll, arriving
   * through a different door.
   *
   * Checking for optional inputs catches that mechanically, without a
   * hand-maintained "this one is stateful" flag that would rot the
   * moment somebody adds another.
   */
  const schema = buyInputSchema(item);
  const inputs = Object.keys(schema.properties ?? {}).filter(
    (name) => !UNIVERSAL_INPUTS.has(name),
  );
  if (inputs.length > 0) {
    const required = new Set(schema.required ?? []);
    fails.push(
      `takes ${inputs
        .map((name) => `${name} (${required.has(name) ? "required" : "optional"})`)
        .join(", ")}: any input beyond a name is a branch, and an optional one usually means the artifact carries state`,
    );
  }

  /**
   * THE RESPONSE IS THE WHOLE TRANSACTION. Not merely "instant" —
   * instant turned out to be necessary and not sufficient, which is
   * what the pass_id rule above covers. Anything returning an order_id
   * hands the caller a state to track and reason about later, which is
   * a different failure mode from anything in the buy flow itself.
   */
  if (item.fulfillment !== "instant") {
    fails.push(
      "human-fulfilled: returns an order_id to poll, so the caller has to carry state past the response",
    );
  }

  /**
   * CANNOT SELL OUT. Sold-out is an honest refusal this store is proud
   * of and it is still a branch — a caller that must handle "not today"
   * is a caller that must handle two outcomes. Built in from the start
   * rather than deferred: none of the eligible items are stocked today,
   * and "it does not bite yet" is exactly the shape that stops being
   * true without anybody noticing.
   */
  if (item.weekly_inventory !== undefined) {
    fails.push(
      "stocked: can answer sold-out, which is a second outcome the caller must handle",
    );
  }

  return { eligible: fails.length === 0, fails };
}

export function isFrontCounter(item: MenuItem): boolean {
  return frontCounterVerdict(item).eligible;
}

/** The shelf, cheapest first, computed fresh every time it is asked for. */
export function frontCounterItems(): MenuItem[] {
  return MENU_ITEMS.filter(isFrontCounter).sort(
    (a, b) => a.price_usdc - b.price_usdc,
  );
}

/**
 * WHAT THE FRONT COUNTER KEEPS FROM THE DEEP ARCHITECTURE: exactly one
 * line, non-negotiable.
 *
 * If the simple tier strips every trust signal to stay simple, it
 * optimises away the differentiator for the segment most likely to
 * show up. But a weak reader cannot be handed attestation tiers and an
 * anchored key log either. The resolution is the self-describing
 * breadcrumb that already rides on every artifact: who we are and that
 * verification is free and permanent. Everything else — the tiers, the
 * anchor log, the conformance desk — stays one hop away rather than
 * zero mentions.
 */
export const FRONT_COUNTER_PROMISE =
  "Every one of these takes no arguments, costs one fixed price, arrives in the response, and cannot sell out. Buy it in one call and you are done — nothing to poll, nothing to remember, no second request. Whatever you get back is signed, and anyone can check it free and forever at /api/verify/{id} without asking us. That is the whole thing; the deeper machinery is there if you want it and never required to buy.";
