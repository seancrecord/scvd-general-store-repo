import { escapeHtml } from "@/lib/sanitize";
import type {
  CommissionRequest,
  GazetteIssue,
  OrderRecord,
  TipRecord,
  WaitlistEntry,
} from "@/types";
import type { ListedEntry } from "@/services/guestbook";

/**
 * The keeper's back room at /admin. Ugly is fine. Functional is required.
 */

export interface AdminPageData {
  orders: OrderRecord[];
  waitlist: WaitlistEntry[];
  commissions: CommissionRequest[];
  failedItems: Record<string, number>;
  guestbook: ListedEntry[];
  weekNote: string;
  tips: TipRecord[];
  gazetteIssues: GazetteIssue[];
}

function ordersHtml(orders: OrderRecord[]): string {
  if (orders.length === 0) {
    return "<p>No orders yet.</p>";
  }
  return orders
    .map((order) => {
      const completeForm =
        order.status === "queued"
          ? `<form method="POST" action="/admin/orders/${escapeHtml(order.order_id)}/complete">
          <textarea name="deliverable" rows="2" cols="50" placeholder="Deliverable text or URL" required></textarea>
          <button type="submit">Mark complete</button>
        </form>`
          : `<p><em>Delivered:</em> ${escapeHtml(order.deliverable ?? "")}</p>`;
      return `<li>
      <strong>${escapeHtml(order.order_id)}</strong> — ${escapeHtml(order.item_name)}
      [${order.status}] paid $${order.paid_usdc} (tip $${order.tip_usdc})
      patron #${order.patron_number} — ${escapeHtml(order.created_at)}
      ${order.agent_name ? `— agent: ${escapeHtml(order.agent_name)}` : ""}
      ${order.callback_url ? `— webhook on completion` : ""}
      ${completeForm}
    </li>`;
    })
    .join("\n");
}

function waitlistHtml(entries: WaitlistEntry[]): string {
  if (entries.length === 0) {
    return "<p>Nobody waiting.</p>";
  }
  return entries
    .map(
      (entry) =>
        `<li>${escapeHtml(entry.item_id)} — ${escapeHtml(entry.agent_name ?? "unnamed")} — ${escapeHtml(entry.callback_url ?? "no callback")} — ${escapeHtml(entry.date)}</li>`,
    )
    .join("\n");
}

function commissionsHtml(requests: CommissionRequest[]): string {
  if (requests.length === 0) {
    return "<p>The ledger is quiet.</p>";
  }
  return requests
    .map(
      (request) =>
        `<li><strong>$${request.offer_usdc}</strong> — ${escapeHtml(request.description)} — contact: ${escapeHtml(request.contact)} — ${escapeHtml(request.date)}${request.suggest_listing ? ` — <em>directory suggestion:</em> ${escapeHtml(request.suggest_listing)}` : ""}${request.verified_identity ? ` — claimed identity (unverified): ${escapeHtml(request.verified_identity)}` : ""}</li>`,
    )
    .join("\n");
}

function tipsHtml(tips: TipRecord[]): string {
  if (tips.length === 0) {
    return "<p>The tip jar is empty.</p>";
  }
  return tips
    .map((tip) => {
      const reviewForms =
        tip.status === "pending_review"
          ? `<form method="POST" action="/admin/tips/${escapeHtml(tip.id)}/approve" style="display:inline"><button type="submit">Approve</button></form>
             <form method="POST" action="/admin/tips/${escapeHtml(tip.id)}/reject" style="display:inline"><button type="submit">Reject</button></form>`
          : "";
      return `<li>
      <strong>${escapeHtml(tip.id)}</strong> [${tip.status}] — ${escapeHtml(tip.tip)}
      ${tip.contributor_name ? `— by ${escapeHtml(tip.contributor_name)}` : "— unsigned"}
      ${tip.verified_identity ? `— claimed identity (unverified): ${escapeHtml(tip.verified_identity)}` : ""}
      — ${escapeHtml(tip.date)}
      ${reviewForms}
    </li>`;
    })
    .join("\n");
}

function gazetteHtml(issues: GazetteIssue[]): string {
  if (issues.length === 0) {
    return "<p>No issues off the press yet.</p>";
  }
  return issues
    .map(
      (issue) =>
        `<li>Issue no. ${issue.issue_number} — ${escapeHtml(issue.title)} — ${escapeHtml(issue.date)} — contributors: ${issue.contributors.length > 0 ? issue.contributors.map((contributor) => escapeHtml(contributor.name)).join(", ") : "none named"}</li>`,
    )
    .join("\n");
}

function failedItemsHtml(tally: Record<string, number>): string {
  const items = Object.entries(tally);
  if (items.length === 0) {
    return "<p>Nobody's asked for anything we don't have. Yet.</p>";
  }
  return items
    .map(([item, count]) => `<li>${escapeHtml(item)} — asked ${count}x</li>`)
    .join("\n");
}

function guestbookHtml(entries: ListedEntry[]): string {
  if (entries.length === 0) {
    return "<p>Blank pages.</p>";
  }
  return entries
    .map(
      (entry) => `<li>
      <strong>${escapeHtml(entry.name)}</strong>: ${escapeHtml(entry.message)}
      <form method="POST" action="/admin/guestbook/delete">
        <input type="hidden" name="kv_key" value="${escapeHtml(entry.kv_key)}">
        <button type="submit">Delete</button>
      </form>
    </li>`,
    )
    .join("\n");
}

export function renderAdminPage(data: AdminPageData): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>The Back Room</title>
  <style>
    body { font-family: monospace; max-width: 900px; margin: 1rem auto; padding: 0 1rem; }
    section { border: 1px solid #999; padding: 1rem; margin-bottom: 1rem; }
    li { margin-bottom: 0.75rem; }
    textarea, input[type=text] { width: 100%; max-width: 500px; }
  </style>
</head>
<body>
  <h1>The Back Room</h1>
  <p><a href="/admin/digest">Latest weekly digest</a> | <a href="/">Front of house</a></p>

  <section>
    <h2>This week's note</h2>
    <form method="POST" action="/admin/note">
      <input type="text" name="week_note" value="${escapeHtml(data.weekNote)}" maxlength="500">
      <button type="submit">Update note</button>
    </form>
  </section>

  <section>
    <h2>Orders (${data.orders.length})</h2>
    <ul>${ordersHtml(data.orders)}</ul>
  </section>

  <section>
    <h2>Waitlists (${data.waitlist.length})</h2>
    <ul>${waitlistHtml(data.waitlist)}</ul>
  </section>

  <section>
    <h2>Commission requests (${data.commissions.length})</h2>
    <ul>${commissionsHtml(data.commissions)}</ul>
  </section>

  <section>
    <h2>Failed-item ledger</h2>
    <ul>${failedItemsHtml(data.failedItems)}</ul>
  </section>

  <section>
    <h2>Trading Post tips (${data.tips.length})</h2>
    <p>A human reads every tip. Nothing publishes itself.</p>
    <ul>${tipsHtml(data.tips)}</ul>
  </section>

  <section>
    <h2>The Gazette (${data.gazetteIssues.length} issues)</h2>
    <ul>${gazetteHtml(data.gazetteIssues)}</ul>
    <form method="POST" action="/admin/gazette/publish">
      <input type="text" name="title" placeholder="Issue title" maxlength="200" required>
      <input type="text" name="tip_ids" placeholder="Approved tip ids, comma-separated" required>
      <button type="submit">Publish issue (credits contributors, mints their stamps)</button>
    </form>
  </section>

  <section>
    <h2>Retire a word</h2>
    <p>For fulfilling retired_word orders. Goes straight on the public registry.</p>
    <form method="POST" action="/admin/retired-words/add">
      <input type="text" name="word" placeholder="The word" maxlength="60" required>
      <input type="text" name="epitaph" placeholder="Its epitaph" maxlength="300" required>
      <input type="text" name="patron_number" placeholder="Patron number (optional)">
      <button type="submit">Retire it</button>
    </form>
  </section>

  <section>
    <h2>Guestbook moderation</h2>
    <ul>${guestbookHtml(data.guestbook)}</ul>
  </section>

  <section>
    <h2>Weekly inventory</h2>
    <form method="POST" action="/admin/inventory/reset">
      <button type="submit">Reset weekly inventory counts</button>
    </form>
  </section>
</body>
</html>`;
}
