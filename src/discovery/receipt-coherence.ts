import { RECEIPT_COHERENCE_FAMILY } from "@/evidence";
import {
  buyRouteFor,
  type SelectedSurface,
} from "@/discovery/receipt-surface";

/**
 * SCHEMA JOIN's sibling: a receipt vs the catalog surface the buyer
 * selected. Missing `saw` (every certificate minted before this
 * field) is not_observed, never a silent agree. A planted price or
 * a hash that does not match is a conflict. No scores.
 */

export const RECEIPT_COHERENCE_CLASS = RECEIPT_COHERENCE_FAMILY.id;

export interface ReceiptCertSide {
  item: string;
  paid_usdc?: number;
  tip_usdc?: number;
  saw?: string;
}

export interface ReceiptDisagreement {
  field: "route" | "price_usdc" | "saw";
  catalog: string | number | null;
  cert: string | number | null;
}

export interface ReceiptJoinVerdict {
  derived: "agree" | "conflict";
  disagreements: ReceiptDisagreement[];
  not_observed: Array<{ field: string; reason: string }>;
}

/** List price as booked: total settled minus tip (PWYD over-minimum). */
export function listPriceUsdc(cert: ReceiptCertSide): number | undefined {
  if (cert.paid_usdc === undefined) return undefined;
  const tip = cert.tip_usdc ?? 0;
  return Math.round((cert.paid_usdc - tip) * 1e6) / 1e6;
}

function usdcEqual(left: number, right: number): boolean {
  return Math.round(left * 1e6) === Math.round(right * 1e6);
}

export function receiptRowVerdict(input: {
  catalog: SelectedSurface | null;
  catalog_saw: string | null;
  cert: ReceiptCertSide;
}): ReceiptJoinVerdict {
  const disagreements: ReceiptDisagreement[] = [];
  const not_observed: ReceiptJoinVerdict["not_observed"] = [];

  if (!input.catalog || !input.catalog_saw) {
    not_observed.push({
      field: "catalog",
      reason: "no menu row for this item — the surface was never a shelf pick",
    });
    return { derived: "agree", disagreements, not_observed };
  }

  const certRoute = buyRouteFor(input.cert.item);
  if (input.catalog.route !== certRoute) {
    disagreements.push({
      field: "route",
      catalog: input.catalog.route,
      cert: certRoute,
    });
  }

  const booked = listPriceUsdc(input.cert);
  if (booked === undefined) {
    not_observed.push({
      field: "price_usdc",
      reason: "free shelf — no payment moved, so no list price was booked",
    });
  } else if (!usdcEqual(input.catalog.price_usdc, booked)) {
    disagreements.push({
      field: "price_usdc",
      catalog: input.catalog.price_usdc,
      cert: booked,
    });
  }

  if (input.cert.saw === undefined) {
    not_observed.push({
      field: "saw",
      reason: "certificate predates the field, or the mint had no menu row",
    });
  } else if (input.cert.saw !== input.catalog_saw) {
    disagreements.push({
      field: "saw",
      catalog: input.catalog_saw,
      cert: input.cert.saw,
    });
  }

  return {
    derived: disagreements.length === 0 ? "agree" : "conflict",
    disagreements,
    not_observed,
  };
}
