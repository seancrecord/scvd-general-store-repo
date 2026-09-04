import { MENU_ITEMS } from "@/store/menu";

/**
 * THE RE-REGISTRATION, SPELLED OUT (2026-09-04, the keeper: "we should
 * put a weekly check in place to make sure we are visible").
 *
 * The CDP search index has no sign-up form and no API: a door is
 * listed when the facilitator settles one real payment for it, and a
 * door nobody buys for a while drops out. So the only press that puts
 * a missing door back is a purchase from a house wallet — the
 * registration run (REGISTRATION_RUN.md), one settle per door. That
 * is the keeper's hand and stays his (rule 30, and the collector
 * cannot pay); what the store can do is say exactly what to run and
 * what it costs, every week the miss stands, instead of once when the
 * list changes.
 */
export interface ReRegistration {
  /** The missing ids that are on the shelf today, in menu order. */
  items: string[];
  /** One copy of each, at today's list price. */
  cost_usd: number;
  /** The exact shopping-run invocation, empty when nothing is missing. */
  command: string;
}

export function reRegistration(missing: readonly string[]): ReRegistration {
  const wanted = new Set(missing);
  const items = MENU_ITEMS.filter((item) => wanted.has(item.id)).map((item) => item.id);
  const cost = MENU_ITEMS.filter((item) => wanted.has(item.id)).reduce(
    (sum, item) => sum + item.price_usdc,
    0,
  );
  return {
    items,
    cost_usd: Math.round(cost * 1000) / 1000,
    command: items.length > 0 ? `ITEMS=${items.join(",")} npm run shop` : "",
  };
}
