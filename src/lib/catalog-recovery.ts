import { getMenuItem } from "@/store";
import { getRetiredItem } from "@/store/retired";

export const CATALOG_TOOL_NAME = "find_in_catalog";

/** A refusal offers a free read, never a replacement purchase or copied payment. */
export function catalogRecovery(base: string, itemId?: string) {
  const retired = itemId ? getRetiredItem(itemId) : undefined;
  const item = itemId ? getMenuItem(itemId) ?? getMenuItem(retired?.folded_into ?? "") : undefined;
  return {
    retry_same_request: false,
    next_step: {
      method: "GET",
      url: item ? `${base}/menu/${item.id}?view=compact` : `${base}/api/catalog/v1`,
      payment_required: false,
      mcp: {
        // A connection scoped to the missing item would reject this read too.
        url: `${base}/mcp`,
        tool: CATALOG_TOOL_NAME,
        arguments: item ? { item_id: item.id } : {},
      },
    },
  };
}
