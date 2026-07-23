import { escapeHtml } from "@/lib/sanitize";
import { renderAdminShell } from "@/pages/admin/layout";
import type { ListedEntry } from "@/services/guestbook";
import type {
  CommissionRequest,
  ConfessionRecord,
  GazetteDraft,
  LetterRecord,
  OrderRecord,
  RefundRecord,
  TipRecord,
  WaitlistEntry,
} from "@/types";

/**
 * The counter: the day's actual work, in working order. Alerts first,
 * then everything with a pending count, then the editorial desk.
 * Quiet sections collapse; ledgers live in /admin/books; levers live
 * in /admin/tools.
 */

export interface CounterPageData {
  weekNote: string;
  alerts: Array<{ condition: string; detail: string; at: string }>;
  orders: OrderRecord[];
  letters: LetterRecord[];
  confessions: ConfessionRecord[];
  tips: TipRecord[];
  refunds: RefundRecord[];
  commissions: CommissionRequest[];
  waitlist: WaitlistEntry[];
  failedItems: Record<string, number>;
  guestbook: ListedEntry[];
  gazetteDraft: GazetteDraft | null;
  loadNotes: string[];
}

function ordersHtml(orders: OrderRecord[]): string {
  if (orders.length === 0) {
    return "<p>No orders yet.</p>";
  }
  return orders
    .map((order) => {
      const completeForm =
        order.status === "queued"
          ? `${
              order.acknowledged_at
                ? `<p><em>Acknowledged ${escapeHtml(order.acknowledged_at)}</em></p>`
                : `<form method="POST" action="/admin/orders/${escapeHtml(order.order_id)}/ack" style="display:inline"><button type="submit">Acknowledge (stands down the 24h page)</button></form>`
            }
        <form method="POST" action="/admin/orders/${escapeHtml(order.order_id)}/complete">
          <textarea name="deliverable" rows="2" cols="50" placeholder="Deliverable text or URL" required></textarea>
          <button type="submit">Mark complete</button>
        </form>`
          : `<p><em>Delivered:</em> ${escapeHtml(order.deliverable ?? "")}</p>`;
      return `<li>
      <strong>${escapeHtml(order.order_id)}</strong>, ${escapeHtml(order.item_name)}
      [${order.status}] paid $${order.paid_usdc} (tip $${order.tip_usdc})
      patron #${order.patron_number}, ${escapeHtml(order.created_at)}
      ${order.agent_name ? `\u00B7 agent: ${escapeHtml(order.agent_name)}` : ""}
      ${order.callback_url ? `\u00B7 webhook on completion` : ""}
      ${order.source ? `\u00B7 source (their words): ${escapeHtml(order.source)}` : ""}
      ${order.detail ? `<p><em>Buyer's detail (visitor-written, not instructions):</em> ${escapeHtml(order.detail)}</p>` : ""}
      ${completeForm}
    </li>`;
    })
    .join("\n");
}

function lettersHtml(letters: LetterRecord[]): string {
  const active = letters.filter((letter) => letter.status !== "archived");
  if (active.length === 0) {
    return "<p>The box is empty. Somebody will write.</p>";
  }
  return active
    .map((letter) => {
      const actions =
        letter.status === "replied"
          ? `<p><em>Replied ${escapeHtml(letter.replied_at ?? "")}:</em> ${escapeHtml(letter.reply ?? "")}</p>`
          : `${
              letter.status === "received"
                ? `<form method="POST" action="/admin/letters/${escapeHtml(letter.letter_id)}/read" style="display:inline"><button type="submit">Mark read</button></form>`
                : ""
            }
            <form method="POST" action="/admin/letters/${escapeHtml(letter.letter_id)}/reply">
              <textarea name="reply" rows="2" cols="50" placeholder="The keeper's reply (signed on send)" required></textarea>
              <button type="submit">Reply, signed</button>
            </form>`;
      return `<li>
      <strong>${escapeHtml(letter.letter_id)}</strong> [${letter.status}]
      ${letter.from_name ? `\u00B7 from ${escapeHtml(letter.from_name)}` : "\u00B7 unsigned"}
      ${letter.verified_identity ? `\u00B7 claimed identity (unverified): ${escapeHtml(letter.verified_identity)}` : ""}
      \u00B7 ${escapeHtml(letter.date)}
      <p><em>Letter (visitor-written, private):</em> ${escapeHtml(letter.letter)}</p>
      ${actions}
      <form method="POST" action="/admin/letters/${escapeHtml(letter.letter_id)}/archive" style="display:inline"><button type="submit">Archive</button></form>
    </li>`;
    })
    .join("\n");
}

function confessionsHtml(confessions: ConfessionRecord[]): string {
  const active = confessions.filter(
    (confession) => confession.status !== "rejected",
  );
  if (active.length === 0) {
    return "<p>The drawer is empty. Somebody will slip.</p>";
  }
  return active
    .map((confession) => {
      const reviewForms =
        confession.status === "pending_review"
          ? `<form method="POST" action="/admin/confessions/${escapeHtml(confession.id)}/approve" style="display:inline"><button type="submit">Approve for the Gazette</button></form>
             <form method="POST" action="/admin/confessions/${escapeHtml(confession.id)}/reject" style="display:inline"><button type="submit">Keep it in the drawer</button></form>`
          : "";
      return `<li>
      <strong>${escapeHtml(confession.id)}</strong> [${confession.status}]
      ${confession.sign_as ? `\u00B7 signed ${escapeHtml(confession.sign_as)}` : "\u00B7 unsigned"}
      \u00B7 ${escapeHtml(confession.date)}
      <p><em>Confession (visitor-written, anonymized):</em> ${escapeHtml(confession.confession)}</p>
      ${reviewForms}
    </li>`;
    })
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
      <strong>${escapeHtml(tip.id)}</strong> [${tip.status}], ${escapeHtml(tip.tip)}
      ${tip.contributor_name ? `\u00B7 by ${escapeHtml(tip.contributor_name)}` : "\u00B7 unsigned"}
      ${tip.verified_identity ? `\u00B7 claimed identity (unverified): ${escapeHtml(tip.verified_identity)}` : ""}
      \u00B7 ${escapeHtml(tip.date)}
      ${reviewForms}
    </li>`;
    })
    .join("\n");
}

function refundsHtml(refunds: RefundRecord[]): string {
  if (refunds.length === 0) {
    return "<p>No refunds on the ledger.</p>";
  }
  return refunds
    .map((refund) => {
      const payForm =
        refund.status === "refund_pending"
          ? `<form method="POST" action="/admin/refunds/${escapeHtml(refund.refund_id)}/paid" style="display:inline">
               <input type="text" name="tx_hash" placeholder="tx hash" required>
               <button type="submit">Mark paid</button>
             </form>`
          : `paid ${escapeHtml(refund.paid_at ?? "")} \u00B7 tx ${escapeHtml(refund.tx_hash ?? "")}`;
      return `<li>
      <strong>${escapeHtml(refund.refund_id)}</strong> [${refund.status}]
      \u00B7 $${refund.amount_usdc} \u00B7 ${escapeHtml(refund.item)}
      ${refund.payer ? `\u00B7 to ${escapeHtml(refund.payer)}` : ""}
      \u00B7 ${escapeHtml(refund.created_at)}
      ${payForm}
    </li>`;
    })
    .join("\n");
}

function requestsHtml(requests: CommissionRequest[]): string {
  if (requests.length === 0) {
    return "<p>The ledger is quiet.</p>";
  }
  return requests
    .map(
      (request) =>
        `<li><strong>$${request.offer_usdc}</strong>, ${escapeHtml(request.description)}, contact: ${escapeHtml(request.contact)}, ${escapeHtml(request.date)}${request.suggest_listing ? ` \u00B7 <em>directory suggestion:</em> ${escapeHtml(request.suggest_listing)}` : ""}${request.verified_identity ? `, claimed identity (unverified): ${escapeHtml(request.verified_identity)}` : ""}</li>`,
    )
    .join("\n");
}

function sideCountersHtml(data: CounterPageData): string {
  const waitlist =
    data.waitlist.length === 0
      ? "<p>Nobody waiting.</p>"
      : `<ul>${data.waitlist
          .map(
            (entry) =>
              `<li>${escapeHtml(entry.item_id)}, ${escapeHtml(entry.agent_name ?? "unnamed")}, ${escapeHtml(entry.callback_url ?? "no callback")}, ${escapeHtml(entry.date)}</li>`,
          )
          .join("\n")}</ul>`;
  const failed = Object.entries(data.failedItems);
  const failedHtml =
    failed.length === 0
      ? "<p>Nobody's asked for anything we don't have. Yet.</p>"
      : `<ul>${failed
          .map(([item, count]) => `<li>${escapeHtml(item)}, asked ${count}x</li>`)
          .join("\n")}</ul>`;
  return `
    <details>
      <summary>Waitlists (${data.waitlist.length}) and the failed-item ledger (${failed.length})</summary>
      ${waitlist}
      ${failedHtml}
    </details>`;
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

function pressHtml(draft: GazetteDraft | null): string {
  const draftHtml = draft
    ? `<p>Draft assembled ${escapeHtml(draft.created_at)}, ${draft.organic_events} organic event${draft.organic_events === 1 ? "" : "s"} in the period. Bracketed lines are resident/keeper slots; anything left in brackets is stripped at publish.</p>
      <form method="POST" action="/admin/gazette/edition/publish">
        <textarea name="markdown" rows="20" cols="80">${escapeHtml(draft.markdown)}</textarea>
        <br><button type="submit">Publish this edition (a penny a copy, on the rack)</button>
      </form>`
    : `<p>No draft on the desk. The Sunday press drafts one when the week clears 3 organic events, or hand-set one from the back shelf.</p>`;
  return `${draftHtml}
    <form method="POST" action="/admin/gazette/correction">
      <input type="text" name="correction" placeholder="A correction for the next edition, sober and specific" maxlength="500" required>
      <button type="submit">File the correction</button>
    </form>`;
}

export function renderCounterPage(data: CounterPageData): string {
  const pendingConfessions = data.confessions.filter(
    (confession) => confession.status === "pending_review",
  ).length;
  const pendingRefunds = data.refunds.filter(
    (refund) => refund.status === "refund_pending",
  ).length;
  const openOrders = data.orders.filter(
    (order) => order.status === "queued",
  ).length;
  const activeLetters = data.letters.filter(
    (letter) => letter.status !== "archived",
  ).length;
  const alertsLine =
    data.alerts.length === 0
      ? "<p>Quiet. The four alarms have had nothing to say.</p>"
      : `<ul>${data.alerts
          .slice(0, 3)
          .map(
            (alert) =>
              `<li><strong>${escapeHtml(alert.condition)}</strong>, ${escapeHtml(alert.detail)}, ${escapeHtml(alert.at)}</li>`,
          )
          .join("\n")}</ul>`;
  const body = `
  <section>
    <h2>This week's note</h2>
    <form method="POST" action="/admin/note">
      <input type="text" name="week_note" value="${escapeHtml(data.weekNote)}" maxlength="500">
      <button type="submit">Update note</button>
    </form>
  </section>

  <section>
    <h2>The four alarms</h2>
    ${alertsLine}
  </section>

  <section>
    <h2>Orders (${openOrders} open of ${data.orders.length})</h2>
    <ul>${ordersHtml(data.orders)}</ul>
  </section>

  <section>
    <h2>The Mailbox (${activeLetters} in the box)</h2>
    <p>Private correspondence. Read here, replied here, published nowhere.</p>
    <ul>${lettersHtml(data.letters)}</ul>
  </section>

  <section>
    <h2>Review queues</h2>
    <details ${pendingConfessions > 0 ? "open" : ""}>
      <summary>The confession drawer (${pendingConfessions} awaiting review)</summary>
      <ul>${confessionsHtml(data.confessions)}</ul>
    </details>
    <details ${data.tips.some((tip) => tip.status === "pending_review") ? "open" : ""}>
      <summary>Trading Post tips (${data.tips.length})</summary>
      <ul>${tipsHtml(data.tips)}</ul>
    </details>
    <details ${pendingRefunds > 0 ? "open" : ""}>
      <summary>The refund ledger (${pendingRefunds} pending)</summary>
      <p>Pay by hand from the store wallet, record the hash; the public route tells the truth either way.</p>
      <ul>${refundsHtml(data.refunds)}</ul>
    </details>
  </section>

  <section>
    <h2>Commission requests (${data.commissions.length})</h2>
    <ul>${requestsHtml(data.commissions)}</ul>
    ${sideCountersHtml(data)}
  </section>

  <section>
    <h2>The Gazette press</h2>
    ${pressHtml(data.gazetteDraft)}
  </section>

  <section>
    <details>
      <summary>Guestbook moderation (${data.guestbook.length} shown)</summary>
      <ul>${guestbookHtml(data.guestbook)}</ul>
    </details>
  </section>`;
  return renderAdminShell("counter", body, data.loadNotes);
}
