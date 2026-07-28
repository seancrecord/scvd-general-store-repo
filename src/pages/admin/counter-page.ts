import { escapeHtml } from "@/lib/sanitize";
import { renderAdminShell } from "@/pages/admin/layout";
import type { CloserEntry } from "@/services/closers";
import type { GrudgeEntry } from "@/services/grudges";
import type { ListedEntry } from "@/services/guestbook";
import { STOCK_DEFINITIONS } from "@/services/stock";
import type { StockUnit } from "@/services/stock";
import type {
  CommissionRequest,
  ConfessionRecord,
  GazetteDraft,
  LetterRecord,
  TrainTagRecord,
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
  /** One line at the top of the room: what the last form actually did. */
  notice?: string;
  weekNote: string;
  alerts: Array<{ condition: string; detail: string; at: string }>;
  orders: OrderRecord[];
  closers: CloserEntry[];
  stockShelves: Record<string, StockUnit[]>;
  grudges: GrudgeEntry[];
  letters: LetterRecord[];
  confessions: ConfessionRecord[];
  trainTags: TrainTagRecord[];
  tips: TipRecord[];
  refunds: RefundRecord[];
  commissions: CommissionRequest[];
  waitlist: WaitlistEntry[];
  failedItems: Record<string, number>;
  guestbook: ListedEntry[];
  gazetteDraft: GazetteDraft | null;
  loadNotes: string[];
}

/**
 * A luckies order completes with structured fields, the card is the
 * record and the record needs its parts. Legacy: luckies draw
 * instantly since 2026-07-25, so this form only appears for orders
 * queued before the ruling. Everything else takes the plain box.
 */
function luckyCompleteForm(orderId: string): string {
  return `<form method="POST" action="/admin/orders/${escapeHtml(orderId)}/complete-lucky">
          <input type="text" name="lucky_name" placeholder="The object's name" maxlength="80" required>
          <input type="text" name="provenance" placeholder="Where it came from (recorded and honest)" maxlength="300" required>
          <input type="text" name="power" placeholder="What it does, farmers-market terms" maxlength="300" required>
          <select name="strength" required>
            <option value="" disabled selected>Strength, graded honest</option>
            <option value="strong">strong</option>
            <option value="solid">solid</option>
            <option value="still proving itself">still proving itself</option>
          </select>
          <button type="submit">Pick it, card it, complete</button>
        </form>`;
}

/** The stocked shelves: the drawer (real oddities) and the name pool. */
function stockShelvesHtml(shelves: Record<string, StockUnit[]>): string {
  const sections = Object.values(STOCK_DEFINITIONS).map((definition) => {
    const units = shelves[definition.itemId] ?? [];
    const unitList =
      units.length === 0
        ? "<p><em>Shelf's bare; the listing shows sold out until you stock it.</em></p>"
        : `<ul>${units
            .map(
              (
                unit,
              ) => `<li>${escapeHtml(Object.values(unit.fields).join(" \u00B7 "))}
              <form method="POST" action="/admin/stock/${definition.itemId}/remove" style="display:inline">
                <input type="hidden" name="unit_id" value="${escapeHtml(unit.unit_id)}">
                <button type="submit">Unstock</button>
              </form></li>`,
            )
            .join("\n")}</ul>`;
    const inputs = definition.fields
      .map(
        (field) =>
          `<input type="text" name="${escapeHtml(field.key)}" placeholder="${escapeHtml(field.label)}" maxlength="${field.cap}"${field.label.includes("(optional)") ? "" : " required"}>`,
      )
      .join("\n      ");
    const bulkBox =
      definition.itemId === "nomenclature"
        ? `<details>
      <summary>Stock a batch of names (one per line; never-reused is machine-enforced)</summary>
      <form method="POST" action="/admin/stock/nomenclature/bulk">
        <textarea name="batch" rows="6" cols="50" placeholder="one considered name per line"></textarea>
        <button type="submit">Stock the batch</button>
      </form>
    </details>`
        : "";
    const shelfNote =
      definition.itemId === "the_drawer"
        ? "<p><em>The real-oddities shelf: a real thing of yours plus what it does, as listed. Describe-only; the object never ships and the shirt never gets named in public code.</em></p>"
        : "";
    return `<section>
    <h2>Stocked shelf: ${escapeHtml(definition.itemId)} (${units.length})</h2>
    ${shelfNote}
    ${unitList}
    <form method="POST" action="/admin/stock/${definition.itemId}">
      ${inputs}
      <button type="submit">Stock it</button>
    </form>
    ${bulkBox}
  </section>`;
  });
  return sections.join("\n\n");
}

function ordersHtml(orders: OrderRecord[]): string {
  if (orders.length === 0) {
    return "<p>No orders yet.</p>";
  }
  return orders
    .map((order) => {
      const completeForm =
        order.status === "queued"
          ? `<p><em>Seen ${escapeHtml(order.acknowledged_at ?? "just now")} (auto-acknowledged on sight; the 24h page stands down)</em></p>
        ${
          order.item_id === "luckies"
            ? luckyCompleteForm(order.order_id)
            : `<form method="POST" action="/admin/orders/${escapeHtml(order.order_id)}/complete">
          <textarea name="deliverable" rows="2" cols="50" placeholder="Deliverable text or URL" required></textarea>
          <button type="submit">Mark complete</button>
        </form>`
        }`
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

/**
 * The train queue. The decline button says what a decline means,
 * because it is the one action in this office that a buyer could
 * mistake for a refund: it isn't one, and the certificate is
 * untouched either way.
 */
function trainHtml(tags: TrainTagRecord[]): string {
  const pending = tags.filter((tag) => tag.status === "pending_review");
  const wall = tags.filter((tag) => tag.status === "approved");
  if (tags.length === 0) {
    return "<p>Bare steel. Nobody's tagged the train yet.</p>";
  }
  const rows = tags
    .map((tag) => {
      const reviewForms =
        tag.status === "pending_review"
          ? `<form method="POST" action="/admin/train/${escapeHtml(tag.id)}/approve" style="display:inline"><button type="submit">Put it up</button></form>
             <form method="POST" action="/admin/train/${escapeHtml(tag.id)}/decline" style="display:inline"><button type="submit">Signed and held</button></form>`
          : "";
      return `<li>
      <strong>${escapeHtml(tag.id)}</strong> [${tag.status}]
      ${tag.name ? `· ${escapeHtml(tag.name)}` : "· unsigned"}
      · bought ${escapeHtml(tag.date.slice(0, 10))}
      ${tag.displayed_at ? `· up since ${escapeHtml(tag.displayed_at.slice(0, 10))}` : ""}
      <p><em>Tag (buyer-written, verbatim):</em> ${escapeHtml(tag.tag)}</p>
      <p><a href="/api/verify/${escapeHtml(tag.cert_id)}">${escapeHtml(tag.cert_id)}</a></p>
      ${reviewForms}
    </li>`;
    })
    .join("\n");
  return `<p>${pending.length} waiting, ${wall.length} on the steel. Declining costs the buyer nothing they paid for: the certificate stands and verifies either way. Not every tag makes the steel.</p>
    <ul>${rows}</ul>`;
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
          .map(
            ([item, count]) => `<li>${escapeHtml(item)}, asked ${count}x</li>`,
          )
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
  /**
   * Stocking a shelf used to redirect in silence, which reads exactly
   * like a form that did nothing. The shelf count was the only
   * confirmation and it is halfway down the page.
   */
  const noticeHtml = data.notice
    ? `<section><p><strong>${escapeHtml(data.notice)}</strong></p></section>`
    : "";
  const body = `
  ${noticeHtml}
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
    <h2>The lucky shelf (preset; nothing to do here)</h2>
    <p>Luckies draw themselves from the herd since 2026-07-25: animal, lucky note, and strength all come off the preset pools in src/store/luckies.ts, never sell out, and need no hands. Write-ins still move a lucky from /admin/tools; the bench is real.</p>
  </section>

  ${stockShelvesHtml(data.stockShelves)}

  <section>
    <h2>The grudge register (Sunday reading)</h2>
    ${
      data.grudges.length === 0
        ? "<p>Nothing held. Somebody will be wronged eventually.</p>"
        : `<ul>${data.grudges
            .map(
              (
                grudge,
              ) => `<li>[${escapeHtml(grudge.status)}] "${escapeHtml(grudge.grievance)}" \u2014 patron #${grudge.patron_number}, ${escapeHtml(grudge.at.slice(0, 10))}
              ${
                grudge.status === "held"
                  ? `<form method="POST" action="/admin/grudges/release" style="display:inline"><input type="hidden" name="key" value="${escapeHtml(grudge.key)}"><button type="submit">Release (they wrote in)</button></form>
                  <form method="POST" action="/admin/grudges/refuse" style="display:inline"><input type="hidden" name="key" value="${escapeHtml(grudge.key)}"><button type="submit">Refuse + refund (abuse)</button></form>`
                  : ""
              }</li>`,
            )
            .join("\n")}</ul>`
    }
  </section>

  <section>
    <h2>The closers list (Sunday coffee reading)</h2>
    ${
      data.closers.length === 0
        ? "<p>No wins on the list yet. Somebody will close.</p>"
        : `<ul>${data.closers
            .map(
              (closer) =>
                `<li>"${escapeHtml(closer.win)}" \u2014 patron #${closer.patron_number}, ${escapeHtml(closer.at.slice(0, 10))}</li>`,
            )
            .join("\n")}</ul>`
    }
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
    <details ${data.trainTags.some((tag) => tag.status === "pending_review") ? "open" : ""}>
      <summary>The train (${data.trainTags.filter((tag) => tag.status === "pending_review").length} waiting to go up)</summary>
      ${trainHtml(data.trainTags)}
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
