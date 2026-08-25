import { buyInputSchema } from "@/lib/bazaar-discovery";
import { sha256Hex } from "@/lib/idempotency";
import { jcsCanonicalize } from "@/lib/jcs";
import type { MenuItem } from "@/types";

/**
 * The catalog surface a buyer selected — route, list price, required
 * inputs. No base URL: env bases differ and the hash has to be the
 * same in CI as in production. Landscape §11 receipt_coherence.
 */
export interface SelectedSurface {
  route: string;
  price_usdc: number;
  required: string[];
}

export function buyRouteFor(itemId: string): string {
  return `/api/buy/${itemId}`;
}

export function selectedSurface(item: MenuItem): SelectedSurface {
  return {
    route: buyRouteFor(item.id),
    price_usdc: item.price_usdc,
    required: [...(buyInputSchema(item).required ?? [])],
  };
}

/** SHA-256 of the JCS form. The certificate stores this hex as `saw`. */
export async function hashSelectedSurface(
  surface: SelectedSurface,
): Promise<string> {
  return sha256Hex(jcsCanonicalize(surface));
}
