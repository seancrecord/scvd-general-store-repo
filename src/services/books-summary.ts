import { taxRows } from "@/services/tax-export";
import { getMenuItem } from "@/store/menu";
import type { Env } from "@/types";

/**
 * THE TAKE: the keeper kept reading the month number first, thinking
 * something was wrong, then finding the real total further down. This
 * inverts the desk: one all-time table, real money off the
 * certificates (the same rows the tax drawer exports), split by how
 * the shelf works — instant, stocked, keeper's queue — rolling up to
 * a total. The month is a slice and says so; this is the number.
 *
 * Same honesty terms as the tax drawer it reads from: penny pages
 * mint no certs and aren't in here (chain is the backstop), refunds
 * are netted, tips are counted with their sale, and a sale whose
 * facilitator returned no wallet is counted organic but tallied in
 * the unknown note rather than silently blended.
 */

export type ShelfKind = "instant" | "stocked" | "queue" | "other";

export interface TakeLine {
  kind: ShelfKind;
  label: string;
  organic_usdc: number;
  house_usdc: number;
  organic_sales: number;
  house_sales: number;
}

export interface RailSlice {
  sales: number;
  usdc: number;
}

export interface TakeSummary {
  lines: TakeLine[];
  total: TakeLine;
  /** Organic only, split by settlement rail off each cert's network. */
  rails: { base: RailSlice; solana: RailSlice; unknown: RailSlice };
  refund_usdc: number;
  unknown_wallet_sales: number;
  truncated: boolean;
}

const LABELS: Record<ShelfKind, string> = {
  instant: "Instant shelf",
  stocked: "Stocked shelf (keeper-made, taken oldest-first)",
  queue: "Keeper's queue (made to order)",
  other: "Retired & other",
};

function shelfKindOf(itemId: string): ShelfKind {
  const item = getMenuItem(itemId);
  if (!item) return "other";
  if (item.stocked) return "stocked";
  return item.fulfillment === "human_queue" ? "queue" : "instant";
}

export async function takeSummary(env: Env): Promise<TakeSummary> {
  const { rows, truncated } = await taxRows(env);
  const lines = new Map<ShelfKind, TakeLine>();
  const line = (kind: ShelfKind): TakeLine => {
    let existing = lines.get(kind);
    if (!existing) {
      existing = {
        kind,
        label: LABELS[kind],
        organic_usdc: 0,
        house_usdc: 0,
        organic_sales: 0,
        house_sales: 0,
      };
      lines.set(kind, existing);
    }
    return existing;
  };
  let refundUsdc = 0;
  let unknownWalletSales = 0;
  const rails: TakeSummary["rails"] = {
    base: { sales: 0, usdc: 0 },
    solana: { sales: 0, usdc: 0 },
    unknown: { sales: 0, usdc: 0 },
  };
  for (const row of rows) {
    const target = line(shelfKindOf(row.item));
    const amount = row.amount_usdc + row.tip_usdc;
    if (row.row_type === "refund") {
      // amount is already negative on refund rows: netting, in the open.
      refundUsdc += -row.amount_usdc;
    }
    if (row.house_flagged === "house") {
      target.house_usdc += amount;
      if (row.row_type === "sale") target.house_sales += 1;
    } else {
      if (row.house_flagged === "unknown" && row.row_type === "sale") {
        unknownWalletSales += 1;
      }
      target.organic_usdc += amount;
      if (row.row_type === "sale") target.organic_sales += 1;
      // The rail split the keeper asked for: organic money, by the
      // network each certificate says it settled on.
      const rail = row.network.startsWith("solana")
        ? rails.solana
        : row.network.startsWith("eip155")
          ? rails.base
          : rails.unknown;
      rail.usdc += amount;
      if (row.row_type === "sale") rail.sales += 1;
    }
  }
  const ORDER: ShelfKind[] = ["instant", "stocked", "queue", "other"];
  const ordered = ORDER.map((kind) => lines.get(kind)).filter(
    (entry): entry is TakeLine => entry !== undefined,
  );
  const total = ordered.reduce(
    (sum, entry) => ({
      ...sum,
      organic_usdc: sum.organic_usdc + entry.organic_usdc,
      house_usdc: sum.house_usdc + entry.house_usdc,
      organic_sales: sum.organic_sales + entry.organic_sales,
      house_sales: sum.house_sales + entry.house_sales,
    }),
    {
      kind: "other" as ShelfKind,
      label: "Total",
      organic_usdc: 0,
      house_usdc: 0,
      organic_sales: 0,
      house_sales: 0,
    },
  );
  return {
    lines: ordered,
    total,
    rails,
    refund_usdc: refundUsdc,
    unknown_wallet_sales: unknownWalletSales,
    truncated,
  };
}
