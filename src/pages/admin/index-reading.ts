import { escapeHtml } from "@/lib/sanitize";
import type { OurDoors } from "@/services/ward-round";

/** Shared by the saved ward, the office and the free live check. */
export function renderIndexReading(doors: OurDoors, at: string, week?: string): string {
  const saved = week !== undefined;
  const date = escapeHtml(doors.checked_at ?? at);
  const legacy = doors.search_basis !== "url-filter-v1";
  const unchecked = doors.unchecked ?? [];
  const count = `${doors.found.length} of ${doors.claimed}`;
  const timing = saved
    ? `A saved weekly reading (${escapeHtml(week)}), taken ${date}. Purchases after this reading do not update it; the original signed round keeps its bytes.`
    : `Read ${date}. This free check does not change a signed round or make a purchase.`;
  const findings = legacy
    ? `The old check reported ${count} doors. Absence was <strong>not established</strong>: it used one ranked search response and did not check the results it could not see. Its old missing list is withdrawn; <a href="/corrections">the correction</a> explains why.`
    : `<strong>${count} payable doors found</strong> in the CDP index.${
        doors.missing.length ? ` <strong>Not returned by complete individual URL checks:</strong> ${escapeHtml(doors.missing.join(", "))}. Reconcile existing purchase receipts, discovery metadata and settlement before considering another payment.` : ""
      }${unchecked.length ? ` <strong>Could not check:</strong> ${escapeHtml(unchecked.join(", "))}. Failed or incomplete lookups are not missing doors.` : ""}`;
  const prices = doors.price_differences?.length
    ? `<p><strong>Index prices differ from the shelf at the time of the reading:</strong></p><ul>${doors.price_differences.map(row =>
        `<li>${escapeHtml(row.id)}: index $${escapeHtml(String(row.catalog_usdc))}; shelf minimum $${escapeHtml(String(row.shelf_usdc))} USDC. Index updated ${escapeHtml(row.last_updated ?? "unknown")}.</li>`
      ).join("")}</ul><p>These are advertised prices, not amounts established to have been charged on your purchases.</p>`
    : (doors.catalog_differs?.length ?? 0) > 0
      ? `<p><strong>Recorded price differences:</strong> ${escapeHtml(doors.catalog_differs!.join(", "))}. This older round stored only the names, not the amounts or index update dates. Check the index now for both prices.</p>`
      : "";
  return `<section><p><strong>Visibility:</strong> ${findings}</p><p>${timing}</p>
    <p><a href="/admin/ward/index">Check the index now — free</a>. A search omission is not a reason to pay again.</p>${prices}</section>`;
}
