import { renderCardPng } from "@/lib/pixel-card";
import { RARITY_LINES, seasonById } from "@/store/cards";
import type { CardRecord } from "@/types";

/**
 * THE SHARE CARD. What a pasted /cards/{id} link unfurls into on X and
 * everywhere else that will not render an SVG: the same 1200x630
 * engraved plaque the passport uses, with the card's own words on it.
 * One renderer for every unfurl on the store, so a card and a passport
 * read as two documents from one desk rather than two desks.
 */
export function renderCardSharePng(card: CardRecord, base: string): Uint8Array {
  const season = seasonById(card.season);
  const setSize = season?.cards.length ?? 0;
  return renderCardPng({
    eyebrow: `THE CARD TABLE · SEASON ONE · ${(season?.name ?? card.season).toUpperCase()}`,
    title: `${RARITY_LINES[card.rarity]} · NO. ${String(card.card_no).padStart(2, "0")} OF ${setSize}`,
    host: card.name,
    observed: `PULLED ${card.date.slice(0, 10)} · PATRON ${card.patron_number}`,
    stale: `PACK ${card.pack_id.replace(/^pack_/, "")} · SLOT ${card.slot}`,
    footer: `${base.replace(/^https?:\/\//, "")}/cards · VERIFIES FREE, FOREVER`,
  });
}
