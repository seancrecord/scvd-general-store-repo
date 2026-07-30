import { listKeys } from "@/lib/kv-list";
import { KV_KEYS } from "@/lib/kv-keys";
import { bulkGetJson } from "@/lib/kv-bulk";
import { newLuckyStockId } from "@/lib/ids";
import type { Env } from "@/types";

/** Ceiling on a stock units scan. An unnamed cap is a silent one. */
const STOCK_CAP = 500;

/**
 * The stocked shelves (Class 1 of the fulfillment restructure): units
 * are fully pre-made by the keeper before they're countable; purchases
 * take the oldest unit and complete themselves; an empty shelf sells
 * out HONESTLY (no 402 nobody can settle) instead of queueing work.
 * This module carries the drawer (the real-oddities shelf) and the
 * name pool; luckies are preset draws in services/luckies.ts.
 */

export interface StockFieldSpec {
  key: string;
  label: string;
  cap: number;
}

export interface StockDefinition {
  itemId: string;
  fields: StockFieldSpec[];
  /** nomenclature: names are never reused, machine-enforced. */
  uniqueField?: string;
}

export const STOCK_DEFINITIONS: Record<string, StockDefinition> = {
  the_drawer: {
    itemId: "the_drawer",
    // The real-oddities shelf (keeper's ruling 2026-07-25): each unit
    // is a real thing of his plus what it does, as listed. Describe-
    // only stands: no photograph, no custody claim; the words ARE the
    // unit, written down exactly and signed under the buyer's name.
    fields: [
      { key: "item", label: "The thing itself", cap: 120 },
      { key: "does", label: "What it does, as listed", cap: 300 },
    ],
  },
  nomenclature: {
    itemId: "nomenclature",
    fields: [{ key: "name", label: "A considered name", cap: 80 }],
    uniqueField: "name",
  },
};

export interface StockUnit {
  unit_id: string;
  item_id: string;
  fields: Record<string, string>;
  stocked_at: string;
}

function nameSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export type StockResult =
  | { stocked: StockUnit }
  | { refused: string };

export async function stockUnit(
  env: Env,
  itemId: string,
  rawFields: Record<string, string>,
  now: Date = new Date(),
): Promise<StockResult> {
  const definition = STOCK_DEFINITIONS[itemId];
  if (!definition) {
    return { refused: `No stocked shelf for ${itemId}.` };
  }
  const fields: Record<string, string> = {};
  for (const spec of definition.fields) {
    const value = (rawFields[spec.key] ?? "").trim().slice(0, spec.cap);
    const optional = spec.label.includes("(optional)");
    if (!value && !optional) {
      return { refused: `Missing ${spec.label}.` };
    }
    if (value) {
      fields[spec.key] = value;
    }
  }
  if (definition.uniqueField) {
    const value = fields[definition.uniqueField] ?? "";
    const usedKey = KV_KEYS.bestowedName(nameSlug(value));
    if (await env.COUNTERS.get(usedKey)) {
      return {
        refused: `"${value}" has been bestowed (or stocked) before. Names are never reused; that is machine-enforced.`,
      };
    }
    await env.COUNTERS.put(usedKey, new Date().toISOString());
  }
  const unit: StockUnit = {
    unit_id: newLuckyStockId(),
    item_id: itemId,
    fields,
    stocked_at: now.toISOString(),
  };
  await env.ORDERS.put(
    KV_KEYS.stockUnit(itemId, unit.unit_id),
    JSON.stringify(unit),
  );
  return { stocked: unit };
}

export async function listStock(
  env: Env,
  itemId: string,
): Promise<StockUnit[]> {
  const listed = await listKeys(env.ORDERS, { prefix: KV_KEYS.stockPrefix(itemId), cap: STOCK_CAP });
  const values = await bulkGetJson<StockUnit>(
    env.ORDERS,
    listed.names,
  );
  const units: StockUnit[] = [];
  for (const unit of values.values()) {
    if (unit) {
      units.push(unit);
    }
  }
  units.sort((a, b) => a.stocked_at.localeCompare(b.stocked_at));
  return units;
}

export async function removeStockUnit(
  env: Env,
  itemId: string,
  unitId: string,
): Promise<void> {
  await env.ORDERS.delete(KV_KEYS.stockUnit(itemId, unitId));
}

/** Oldest first, delete on take; same take-race caveat as the blessing jar. */
export async function takeStockUnit(
  env: Env,
  itemId: string,
): Promise<StockUnit | null> {
  const units = await listStock(env, itemId);
  const next = units[0];
  if (!next) {
    return null;
  }
  await removeStockUnit(env, itemId, next.unit_id);
  return next;
}
