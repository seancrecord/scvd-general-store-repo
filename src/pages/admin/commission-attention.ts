import { escapeHtml } from "@/lib/sanitize";
import { deskStatusOf } from "@/services/commission-desk";
import type { CommissionRequest, OrderRecord } from "@/types";

/** A reminder window, not a change to the quote's payment or delivery terms. */
const EXPIRING_HOURS = 48;
const PREVIEW_ROWS = 5;

export function commissionAttention(
  requests: CommissionRequest[], orders: OrderRecord[], now: Date, incomplete: boolean,
): { html: string; reviewCount: number; missingCount: number } {
  const groups: Record<"new" | "expired" | "expiring" | "waiting" | "unknown" | "missing", CommissionRequest[]> = {
    new: [], expired: [], expiring: [], waiting: [], unknown: [], missing: [],
  };
  const orderIds = new Set(orders.map(order => order.order_id));
  for (const request of requests) {
    if (request.suggest_listing) continue;
    const status = deskStatusOf(request, now);
    if (status === "requested") groups.new.push(request);
    else if (status === "expired") groups.expired.push(request);
    else if (status === "accepted" && (!request.order_id || !orderIds.has(request.order_id))) groups.missing.push(request);
    else if (status === "quoted") {
      const expiry = Date.parse(request.quote_expires_at ?? "");
      if (!Number.isFinite(expiry)) groups.unknown.push(request);
      else if (expiry - now.getTime() <= EXPIRING_HOURS * 3600_000) groups.expiring.push(request);
      else groups.waiting.push(request);
    }
  }
  for (const group of Object.values(groups)) {
    group.sort((a, b) => (a.quote_expires_at ?? a.date).localeCompare(b.quote_expires_at ?? b.date) || a.id.localeCompare(b.id));
  }
  const openOrders = orders.filter(order => order.status === "queued")
    .sort((a, b) => (Date.parse(a.created_at) + a.sla_hours * 3600_000) - (Date.parse(b.created_at) + b.sla_hours * 3600_000));
  const section = (title: string, rows: string[], target: string): string => rows.length === 0 ? "" :
    `<h3>${title} (${rows.length})</h3><ul>${rows.slice(0, PREVIEW_ROWS).join("")}</ul>${rows.length > PREVIEW_ROWS ? `<p><a href="#${target}">See all ${rows.length}; first ${PREVIEW_ROWS} shown above</a></p>` : ""}`;
  const requestRows = (rows: CommissionRequest[], action: string) => rows.map(request =>
    `<li><a href="#request-${escapeHtml(encodeURIComponent(request.id))}">${escapeHtml(request.description.slice(0, 120))}${request.description.length > 120 ? "…" : ""}</a> — ${action}${request.quote_expires_at ? ` · expires ${escapeHtml(request.quote_expires_at)}` : ""}</li>`);
  const reviewCount = groups.new.length + groups.expired.length + groups.expiring.length + groups.unknown.length;
  const html = `<section id="needs-attention">
    <h2>Needs attention</h2>
    ${incomplete ? "<p><strong>Partial reading.</strong> Counts cover loaded records only; more work may be missing. Check the load notes and reload.</p>" : ""}
    <p>Briefs and quotes are unpaid. Proposed budgets are not revenue. Times are UTC.</p>
    ${section("Paid work to deliver", openOrders.map(order => {
      const due = Date.parse(order.created_at) + order.sla_hours * 3600_000;
      return `<li><a href="#order-${escapeHtml(encodeURIComponent(order.order_id))}">${escapeHtml(order.item_name)} · ${escapeHtml(order.order_id)}</a> — paid ${order.paid_usdc} USDC · ${Number.isFinite(due) ? `due ${escapeHtml(new Date(due).toISOString())}` : "delivery date unavailable"}</li>`;
    }), "orders")}
    ${section("Accepted request: check order", requestRows(groups.missing, "Order not in this reading; check its record before acting."), "requests")}
    ${section("New briefs", requestRows(groups.new, "Review brief, quote or decline"), "requests")}
    ${section("Expired quotes", requestRows(groups.expired, "Re-quote or decline"), "requests")}
    ${section(`Expiring within ${EXPIRING_HOURS} hours`, requestRows(groups.expiring, "Review quote before expiry"), "requests")}
    ${section("Quote date needs review", requestRows(groups.unknown, "Check terms and expiry"), "requests")}
    ${section("Waiting on buyer", requestRows(groups.waiting, "No keeper action due; view status or revise terms"), "requests")}
    ${!incomplete && !openOrders.length && !reviewCount && !groups.missing.length ? "<p>No brief, quote or paid order needs action in this reading.</p>" : ""}
  </section>`;
  return { html, reviewCount, missingCount: groups.missing.length };
}
