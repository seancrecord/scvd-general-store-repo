/**
 * THE RETIRED SHELF. A cut is a retirement, not a deletion: the id
 * never comes back for something else, every certificate issued
 * under it resolves forever, and a wallet that asks for one gets
 * told what happened instead of a bare 404 — a store that forgets
 * its own shelves looks broken to the agent that remembered them.
 *
 * First enacted 2026-08-05, on the keeper's word, after the first
 * month of real demand data (docs/archive/MENU_CONSOLIDATION.md). The rule
 * that survives the list: nothing with an organic settle was cut.
 */

export interface RetiredItem {
  id: string;
  name: string;
  retired_on: string;
  /** One honest sentence for whoever comes asking. */
  note: string;
  /** Where the job went, if it went anywhere. */
  folded_into?: string;
}

export const RETIRED_ITEMS: readonly RetiredItem[] = [
  {
    id: "a_secret",
    name: "A Secret",
    retired_on: "2026-08-05",
    note: "The keeper's secrets came off the shelf. The ones already sold stay sold and stay secret.",
  },
  {
    id: "grudge",
    name: "Grudge (Held on Your Behalf)",
    retired_on: "2026-08-05",
    note: "The grudge shelf closed. Grudges already held are held until released, as promised — the register does not forget.",
  },
  {
    id: "phantom_check",
    name: "Phantom Check",
    retired_on: "2026-08-05",
    note: "Its job was the context anchor's job, and the anchor does it better.",
    folded_into: "context_anchor",
  },
  {
    id: "phone_call",
    name: "A Phone Call",
    retired_on: "2026-08-05",
    note: "Folded into The Collab: name the shape you want the keeper's time to take.",
    folded_into: "the_collab",
  },
  {
    id: "human_witness",
    name: "Human Witness",
    retired_on: "2026-08-05",
    note: "Folded into The Collab: name the shape you want the keeper's time to take.",
    folded_into: "the_collab",
  },
  {
    id: "portrait",
    name: "Portrait",
    retired_on: "2026-08-05",
    note: "Folded into The Collab: name the shape you want the keeper's time to take.",
    folded_into: "the_collab",
  },
  {
    id: "app_gutcheck",
    name: "App Gutcheck",
    retired_on: "2026-08-05",
    note: "Folded into The Collab: name the shape you want the keeper's time to take.",
    folded_into: "the_collab",
  },
  {
    id: "nomenclature",
    name: "Nomenclature",
    retired_on: "2026-08-05",
    note: "The name registry closed to new claims. Names already granted are never re-issued and their certificates verify forever.",
  },
  /**
   * SECOND RETIREMENT, 2026-08-20, on the keeper's word — the Costco
   * curation pass (memory/costco-for-agents.md: kill what doesn't
   * move, perfect what does, then add the next one). Round one's rule
   * held again: nothing with an organic settle was cut, which is why
   * coffees_for_closers and graffiti_on_a_train stayed on the shelf.
   */
  {
    id: "the_drawer",
    name: "The Drawer",
    retired_on: "2026-08-20",
    note: "The drawer closed. It was tested and it was fun — and it can always come back — but it isn't where this store is headed right now: the keeper's hands belong on the evidence work. What was drawn stays drawn, and every card signed under it verifies forever.",
  },
  {
    id: "daily_fortune",
    name: "Daily Fortune",
    retired_on: "2026-08-20",
    note: "The fortune came off the shelf. Tested, fun, and it can always come back — but it isn't where we're headed right now, and the half-cent blessing already does its real job (a real settlement for almost nothing) cheaper.",
    folded_into: "small_blessing",
  },
  {
    id: "dibs",
    name: "Dibs",
    retired_on: "2026-08-20",
    note: "Dibs closed. It was tested, it was fun, and it even sold — it can always come back — but it isn't where we're headed right now: timestamped precedence became the trust shelf's actual work. A mandate records what you claimed before you acted, and a Bitcoin anchor proves when, neither of which asks anyone to take our word for the ordering.",
    folded_into: "the_mandate",
  },
  {
    id: "quick_judgment",
    name: "Quick Judgment",
    retired_on: "2026-08-20",
    note: "Folded into The Collab, the same way the phone call and the human witness went in round one. Tested and fun, and not really gone: one door now holds the keeper's time, and you name the shape you want it to take — a quick judgment is still a shape you can name.",
    folded_into: "the_collab",
  },
] as const;

export function getRetiredItem(id: string): RetiredItem | undefined {
  return RETIRED_ITEMS.find((item) => item.id === id);
}
