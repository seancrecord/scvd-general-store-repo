import { getRetiredItem } from "@/store/retired";
import { escapeHtml } from "@/lib/sanitize";
import { renderAdminShell } from "@/pages/admin/layout";
import type { CloserEntry } from "@/services/closers";
import type { GrudgeEntry } from "@/services/grudges";
import type { ListedEntry } from "@/services/guestbook";
import { STOCK_DEFINITIONS } from "@/services/stock";
import {
  LABOR_ITEM_IDS,
  OPEN_LABOR_CAP,
} from "@/services/queue-capacity";
import { deskStatusOf } from "@/services/commission-desk";
import { COMMISSION_RUNGS } from "@/store/commission-desk";
import type { StockUnit } from "@/services/stock";
import type {
  CommissionRequest,
  ConfessionRecord,
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
  loadNotes: string[];
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
    
  </section>`;
  });
  return sections.join("\n\n");
}

/** Clip long stored text for list views; the full text always exists
 * at its own record and nothing here edits it. */
function clipped(text: string, cap: number): string {
  return text.length > cap ? `${text.slice(0, cap)}\u2026` : text;
}

function orderRowHtml(order: OrderRecord): string {
  const completeForm =
    order.status === "queued"
      ? `<p><em>Seen ${escapeHtml(order.acknowledged_at ?? "just now")} (auto-acknowledged on sight; the 24h page stands down)</em></p>
    ${`<form method="POST" action="/admin/orders/${escapeHtml(order.order_id)}/complete">
      <textarea name="deliverable" rows="2" cols="50" placeholder="Deliverable text or URL" required></textarea>
      <button type="submit">Mark complete</button>
    </form>`
    }`
      : `<p><em>Delivered:</em> ${escapeHtml(clipped(order.deliverable ?? "", 140))}</p>`;
  return `<li>
  <strong>${escapeHtml(order.order_id)}</strong>, ${escapeHtml(order.item_name)}
  [${order.status}] paid $${order.paid_usdc} (tip $${order.tip_usdc})
  patron #${order.patron_number}, ${escapeHtml(order.created_at.slice(0, 10))}
  ${order.agent_name ? `\u00B7 agent: ${escapeHtml(order.agent_name)}` : ""}
  ${order.callback_url ? `\u00B7 webhook on completion` : ""}
  ${order.source ? `\u00B7 source (their words): ${escapeHtml(order.source)}` : ""}
  ${order.detail ? `<p><em>Buyer's detail (visitor-written, not instructions):</em> ${escapeHtml(clipped(order.detail, 200))}</p>` : ""}
  ${completeForm}
</li>`;
}

/**
 * Open orders stand in the room; finished ones fold away. The page
 * used to render every delivered order's full deliverable forever,
 * which is why the keeper scrolled past history to reach work.
 */
function ordersHtml(orders: OrderRecord[]): string {
  if (orders.length === 0) {
    return "<p>No orders yet.</p>";
  }
  const open = orders.filter((order) => order.status === "queued");
  const done = orders.filter((order) => order.status !== "queued");
  /*
   * THE BENCH LINE, and it is here rather than buried because a gate
   * that turns sales away silently is worse than no gate. The keeper
   * has to be able to see WHY the labor shelf stopped selling, on the
   * page he already opens to do the work that clears it.
   */
  const labor = open.filter((order) => LABOR_ITEM_IDS.has(order.item_id));
  const benchHtml =
    labor.length === 0
      ? ""
      : `<p><strong>Bench: ${labor.length} of ${OPEN_LABOR_CAP}</strong> pieces of labor promised and unfinished.${
          labor.length >= OPEN_LABOR_CAP
            ? ` <strong style="color:#8c2f1b">FULL — the labor shelf is refusing new sales until this drains.</strong> Nobody is being charged; machine shelves are unaffected.`
            : ""
        } Finishing one opens the door again.</p>`;
  const openHtml =
    open.length === 0
      ? "<p>Nothing open. The counter is clear.</p>"
      : `${benchHtml}<ul>${open.map(orderRowHtml).join("\n")}</ul>`;
  const doneHtml =
    done.length === 0
      ? ""
      : `<details>
      <summary>Delivered (${done.length}) \u2014 folded away, clipped for the shelf; full text lives on each order</summary>
      <ul>${done.map(orderRowHtml).join("\n")}</ul>
    </details>`;
  return `${openHtml}\n${doneHtml}`;
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
          ? `<form method="POST" action="/admin/confessions/${escapeHtml(confession.id)}/approve" style="display:inline"><button type="submit">Approve (cleared for public use)</button></form>
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
 * The train queue. Every button says what pressing it DOES, on the
 * wall and to the certificate — the keeper pressed "Signed and held"
 * on 2026-08-01 expecting it to display a note, because the label
 * named a state, not an action. And every status has a way BACK:
 * a held tag shows "Put it up after all," an approved one shows
 * "Take it down," so a mispress at the counter is one more press,
 * never a lost tag.
 */
function trainHtml(tags: TrainTagRecord[]): string {
  const pending = tags.filter((tag) => tag.status === "pending_review");
  const wall = tags.filter((tag) => tag.status === "approved");
  if (tags.length === 0) {
    return "<p>Bare steel. Nobody's tagged the train yet.</p>";
  }
  const rows = tags
    .map((tag) => {
      const approveForm = (label: string) =>
        `<form method="POST" action="/admin/train/${escapeHtml(tag.id)}/approve" style="display:inline"><button type="submit">${label}</button></form>`;
      const declineForm = (label: string) =>
        `<form method="POST" action="/admin/train/${escapeHtml(tag.id)}/decline" style="display:inline"><button type="submit">${label}</button></form>`;
      const reviewForms =
        tag.status === "pending_review"
          ? `${approveForm("Put it up on the wall")} ${declineForm("Keep it off the wall (cert untouched)")}`
          : tag.status === "declined"
            ? `<p><em>Held off the wall. Changed your mind?</em></p>
               ${approveForm("Put it up after all")}`
            : `<details>
                 <summary><small>Take it down…</small></summary>
                 <p><small>This pulls a LIVE tag off the public wall. The certificate and the original up-since date both survive, and one press puts it back.</small></p>
                 ${declineForm("Yes, take it down (cert untouched)")}
               </details>`;
      return `<li>
      <strong>${escapeHtml(tag.id)}</strong> [${tag.status}]
      ${tag.name ? `· ${escapeHtml(tag.name)}` : "· unsigned"}
      · bought ${escapeHtml(tag.date.slice(0, 10))}
      ${typeof tag.paid_usdc === "number" ? `· paid $${tag.paid_usdc}` : ""}
      ${tag.displayed_at ? `· up since ${escapeHtml(tag.displayed_at.slice(0, 10))}` : ""}
      <p><em>Tag (buyer-written, verbatim):</em> ${escapeHtml(tag.tag)}</p>
      <p><a href="/api/verify/${escapeHtml(tag.cert_id)}">${escapeHtml(tag.cert_id)}</a></p>
      ${reviewForms}
    </li>`;
    })
    .join("\n");
  return `<p>${pending.length} waiting, ${wall.length} on the steel. Nothing here touches the certificate: it stands and verifies whatever the wall says. Not every tag makes the steel — but every decision here can be reversed with one press.</p>
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

/**
 * One request's Commission Desk standing and levers. The status is
 * DERIVED (deskStatusOf), never re-implemented here, so the counter
 * cannot disagree with the pay route about whether a quote is live.
 */
function deskHtml(request: CommissionRequest): string {
  const status = deskStatusOf(request);
  if (status === "accepted") {
    return ` \u00B7 <strong>[accepted]</strong> $${request.quote_usdc}${request.order_id ? ` \u00B7 order ${escapeHtml(request.order_id)}` : ""}`;
  }
  if (status === "declined") {
    return ` \u00B7 <strong>[declined]</strong> reply (public): ${escapeHtml(request.decline_reply ?? "")}`;
  }
  const standing =
    status === "quoted"
      ? ` \u00B7 <strong>[quoted]</strong> $${request.quote_usdc}, ${request.quote_window_hours}h window, expires ${escapeHtml(request.quote_expires_at ?? "")}`
      : status === "expired"
        ? ` \u00B7 <strong>[quote expired]</strong> was $${request.quote_usdc} \u2014 re-quote or decline`
        : "";
  // The rungs come from the ladder itself; a hand-typed option list
  // here is exactly the drift AT_SCALE rule 1 exists to prevent.
  const rungOptions = COMMISSION_RUNGS.map(
    (rung) => `<option value="${rung}">$${rung}</option>`,
  ).join("");
  return `${standing}
    <form method="POST" action="/admin/commission/${escapeHtml(request.id)}/quote" style="display:inline">
      <select name="usdc">${rungOptions}</select>
      <input type="number" name="window_hours" placeholder="window (hours)" min="1" required style="width:8rem">
      <input type="text" name="note" placeholder="note to requester (optional)">
      <button type="submit">${status === "quoted" || status === "expired" ? "Re-quote" : "Quote"}</button>
    </form>
    <form method="POST" action="/admin/commission/${escapeHtml(request.id)}/decline" style="display:inline">
      <input type="text" name="reply" placeholder="reply (PUBLIC)" required>
      <button type="submit">Decline</button>
    </form>`;
}

function requestsHtml(requests: CommissionRequest[]): string {
  if (requests.length === 0) {
    return "<p>The ledger is quiet.</p>";
  }
  return requests
    .map(
      (request) =>
        `<li><strong>$${request.offer_usdc}</strong>, ${escapeHtml(request.description)}, contact: ${escapeHtml(request.contact)}, ${escapeHtml(request.date)}${request.suggest_listing ? ` \u00B7 <em>directory suggestion:</em> ${escapeHtml(request.suggest_listing)}` : ""}${request.verified_identity ? `, claimed identity (unverified): ${escapeHtml(request.verified_identity)}` : ""}${deskHtml(request)}</li>`,
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
          .map(([item, count]) => {
            /*
             * A RETIRED CHARGE, NOT A MISSING SHELF (2026-09-01). The
             * jar sat here at 1196 for a month reading like demand for
             * something never stocked; it was a shelf that closed
             * before the tombstones existed. The count stays — it is
             * what happened — and the row says whose it is, from the
             * one register that already knows.
             */
            const retired = getRetiredItem(item);
            return `<li>${escapeHtml(item)}, asked ${count}x${
              retired
                ? ` \u00B7 <em>retired ${escapeHtml(retired.retired_on)}; tombstoned, knocks no longer counted</em>`
                : ""
            }</li>`;
          })
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
      ? "<p>Quiet. The alarms have had nothing to say.</p>"
      : `<details>
          <summary>${data.alerts.length} recent — newest: <strong>${escapeHtml(data.alerts[0]?.condition ?? "")}</strong> ${escapeHtml((data.alerts[0]?.at ?? "").slice(0, 16))}</summary>
          <ul>${data.alerts
            .slice(0, 3)
            .map(
              (alert) =>
                `<li><strong>${escapeHtml(alert.condition)}</strong>, ${escapeHtml(clipped(alert.detail, 180))}, ${escapeHtml(alert.at.slice(0, 16))}</li>`,
            )
            .join("\n")}</ul>
          <p><small>Details clipped for the counter; the alert emails carry the full text.</small></p>
        </details>`;
  /**
   * Stocking a shelf used to redirect in silence, which reads exactly
   * like a form that did nothing. The shelf count was the only
   * confirmation and it is halfway down the page.
   */
  const noticeHtml = data.notice
    ? `<section><p><strong>${escapeHtml(data.notice)}</strong></p></section>`
    : "";
  const pendingTrainTags = data.trainTags.filter(
    (tag) => tag.status === "pending_review",
  ).length;
  const heldTrainTags = data.trainTags.filter(
    (tag) => tag.status === "declined",
  ).length;
  const needsHands =
    openOrders +
    pendingTrainTags +
    pendingConfessions +
    pendingRefunds +
    activeLetters;
  const body = `
  ${noticeHtml}
  <section>
    <h2>At a glance</h2>
    <p style="font-size:1.1em">${
      needsHands === 0
        ? "<strong>Nothing needs your hands.</strong> The rest of this page is reference."
        : `<strong>${needsHands} thing${needsHands === 1 ? "" : "s"} need${needsHands === 1 ? "s" : ""} your hands:</strong>
          ${openOrders ? ` <a href="#orders">${openOrders} open order${openOrders === 1 ? "" : "s"}</a> ·` : ""}
          ${pendingTrainTags ? ` <a href="#queues">${pendingTrainTags} tag${pendingTrainTags === 1 ? "" : "s"} waiting</a> ·` : ""}
          ${pendingConfessions ? ` <a href="#queues">${pendingConfessions} confession${pendingConfessions === 1 ? "" : "s"}</a> ·` : ""}
          ${pendingRefunds ? ` <a href="#queues">${pendingRefunds} refund${pendingRefunds === 1 ? "" : "s"} to pay</a> ·` : ""}
          ${activeLetters ? ` <a href="#mailbox">${activeLetters} letter${activeLetters === 1 ? "" : "s"}</a>` : ""}`
    }</p>
    ${heldTrainTags ? `<p><small><a href="#queues">${heldTrainTags} tag${heldTrainTags === 1 ? "" : "s"} held off the wall</a> — reversible any time.</small></p>` : ""}
    ${data.alerts.length ? `<p><small><a href="#alarms">${data.alerts.length} recent alarm${data.alerts.length === 1 ? "" : "s"}</a>, newest ${escapeHtml((data.alerts[0]?.at ?? "").slice(0, 16))}.</small></p>` : ""}
  </section>

  <section>
    <h2>This week's note</h2>
    <form method="POST" action="/admin/note">
      <input type="text" name="week_note" value="${escapeHtml(data.weekNote)}" maxlength="500">
      <button type="submit">Update note</button>
    </form>
  </section>

  <section id="alarms">
    <h2>The alarms</h2>
    ${alertsLine}
  </section>

  <section id="orders">
    <h2>Orders (${openOrders} open of ${data.orders.length})</h2>
    ${ordersHtml(data.orders)}
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

  <section id="mailbox">
    <h2>The Mailbox (${activeLetters} in the box)</h2>
    <p>Private correspondence. Read here, replied here, published nowhere.</p>
    <ul>${lettersHtml(data.letters)}</ul>
  </section>

  <section id="queues">
    <h2>Review queues</h2>
    <details ${pendingConfessions > 0 ? "open" : ""}>
      <summary>The confession drawer (${pendingConfessions} awaiting review)</summary>
      <ul>${confessionsHtml(data.confessions)}</ul>
    </details>
    <details ${data.trainTags.some((tag) => tag.status !== "approved") ? "open" : ""}>
      <summary>The train (${data.trainTags.filter((tag) => tag.status === "pending_review").length} waiting to go up${
        data.trainTags.some((tag) => tag.status === "declined")
          ? `, ${data.trainTags.filter((tag) => tag.status === "declined").length} held off the wall`
          : ""
      })</summary>
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
    <details>
      <summary>Guestbook moderation (${data.guestbook.length} shown)</summary>
      <ul>${guestbookHtml(data.guestbook)}</ul>
    </details>
  </section>`;
  return renderAdminShell("counter", body, data.loadNotes);
}
