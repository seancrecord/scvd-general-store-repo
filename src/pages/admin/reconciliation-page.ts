import type { SettleReconciliation } from "@/lib/metrics";
import { escapeHtml } from "@/lib/sanitize";
import { renderAdminShell } from "@/pages/admin/layout";
import type { CertificatesAgainstSettles } from "@/services/settle-sources";
import {
  unreadBlocks,
  type SkippedBlockRange,
  type SkippedRangesRecord,
} from "@/services/chain-reconciliation";
import type { DeliveryAudit } from "@/services/delivery-audit";

/** Matches listAlerts' inline row shape. */
interface AlertLogEntry {
  condition: string;
  detail: string;
  /** True when this first fired after the keeper's previous visit. */
  is_new?: boolean;
  /** FIRST seen, and it does not move. See lib/alerts. */
  at: string;
  last_seen?: string;
  repeats?: number;
  /**
   * For undelivered_sale entries only: what the intent looks like
   * NOW. The keeper read three old alerts as three live problems —
   * the trail must say when history has since been handled.
   */
  now?: "still open" | "resolved by hand" | "closed (delivered)";
  /**
   * WHICH resolution was recorded — `refunded`, `fulfilled_by_hand`,
   * `house_absorbed`, possibly "(corrected)". The stamp said only THAT
   * a row was resolved until 2026-08-10, and those three outcomes are
   * opposite claims about where the money went.
   */
  resolved_as?: string;
  /** The settlement tx parsed from the detail, for the inline resolve. */
  tx?: string;
}

/**
 * THE BOOKS CHECK: every way the store audits its own money, on one
 * page, each one a verdict first and numbers second. The keeper
 * asked for exactly this — one place to look instead of a verdict
 * scattered across the desk, the recount, the ward, and a JSON
 * route. The rule of the page: green says PASS and why it can, red
 * says what to chase, and nothing renders a number without saying
 * what would be wrong if it were different.
 */

export interface ReconciliationPageData {
  settles: SettleReconciliation | null;
  /** The certificates read beside the counters and the rows; absent until the route wires it. */
  certs?: CertificatesAgainstSettles | null;
  chain: {
    baseCursor: string | null;
    /** The third rail's walk: same discipline, its own cursor. */
    polygonCursor: string | null;
    polygonLastResult: {
      ran: boolean;
      reason?: string;
      failed?: boolean;
      at: string;
    } | null;
    solanaLastOk: string | null;
    solanaLastResult: {
      ran: boolean;
      reason?: string;
      transfers_seen?: number;
      at: string;
    } | null;
    /**
     * Base block ranges the walk moved past without reading (ledger
     * #22). A coverage claim over the Base rail is only honest with
     * these beside it: nothing ever swept them and nothing will.
     */
    baseSkipped: SkippedRangesRecord | null;
  };
  deliveries: DeliveryAudit | null;
  alerts: AlertLogEntry[];
  /**
   * When the keeper last loaded this page, or null if never. Only used
   * to word the header honestly — the per-row NEW mark is decided by
   * the route, which has the watermark in hand when it reads the log.
   */
  alertsLastRead: string | null;
  loadNotes: string[];
}

const PASS = `<strong style="color:#2f6b2f">PASS</strong>`;
const ATTENTION = `<strong style="color:#8c2f1b">ATTENTION</strong>`;

function certsHtml(c: CertificatesAgainstSettles | null | undefined, settles: SettleReconciliation | null): string {
  if (c === undefined) return "";
  if (c === null) return `<p><small>The certificates could not be read this time; reload to retry.</small></p>`;
  const rows = c.wallets_disagreeing.slice(0, 10).map((w) =>
    `<tr><td><code>${escapeHtml(w.address)}</code></td><td>${w.payer_row_purchases}</td><td>${w.certificates}</td></tr>`).join("");
  return `<details ${settles && settles.unexplained !== 0 ? "open" : ""}><summary>The third witness: the certificates</summary>
    <p>${escapeHtml(c.reading)}</p>
    <table border="1" cellpadding="4">
      <tr><td>certificates on the shelf</td><td>${c.certificates_total}${c.certificates_truncated ? " (scan capped)" : ""}</td></tr>
      <tr><td>…carrying a paying wallet</td><td>${c.certificates_with_payer}</td></tr>
      <tr><td>payer rows / purchases on them</td><td>${c.payer_rows} / ${c.payer_rows_purchases}</td></tr>
      <tr><td>wallets whose row and certificates disagree</td><td>${c.wallets_disagreeing.length}</td></tr>
    </table>
    ${rows ? `<table border="1" cellpadding="4"><tr><th>wallet</th><th>row says</th><th>certificates</th></tr>${rows}</table>` : ""}
    <p><small>Every wallet, with what it bought and in what order, is on <a href="/admin/buyers">the buyers</a>.</small></p>
    </details>`;
}

function settlesHtml(r: SettleReconciliation | null): string {
  if (!r) return `<p>${ATTENTION} — the recount didn't load. Reload to retry.</p>`;
  const verdict =
    r.unexplained === 0
      ? `<p>${PASS} — every settle the counters know is on a payer row, the founding settle, or a settle that arrived without a wallet address.</p>`
      : r.unexplained > 0
        ? `<p>${ATTENTION} — ${r.unexplained} settle${r.unexplained === 1 ? "" : "s"} moved a counter without writing a payer row. This is the one to chase.</p>`
        : `<p>${ATTENTION} — ${-r.unexplained} more purchase${r.unexplained === -1 ? "" : "s"} on the payer rows than the counters admit.</p>`;
  return `${verdict}
    <details><summary>The arithmetic</summary>
    <table border="1" cellpadding="4">
      <tr><td>settles on the counters</td><td>${r.counter_settles}</td></tr>
      <tr><td>purchases on the payer rows</td><td>${r.payer_purchases}</td></tr>
      <tr><td>the founding settle (predates the instrument)</td><td>${r.founding}</td></tr>
      <tr><td>settles with no payer address returned</td><td>${r.unattributed}</td></tr>
      <tr><td><strong>unexplained</strong></td><td><strong>${r.unexplained}</strong></td></tr>
    </table>
    <p><small>All-time on both sides: payer rows carry no month, so a
    month-window compare would manufacture a discrepancy every time the
    calendar turned. Row-level detail lives at <a href="/admin/recount">the recount</a>.</small></p>
    </details>`;
}

/** A pass is stale after this long: both rails audit hourly. */
const CHAIN_STALE_MS = 3 * 60 * 60 * 1000;

function chainHtml(chain: ReconciliationPageData["chain"], now: Date): string {
  const solana = (() => {
    if (!chain.solanaLastOk) {
      const last = chain.solanaLastResult;
      // The WHY lives in the last-result record — showing it only on
      // success was exactly inverted (the keeper asked "why" and the
      // page was sitting on the answer).
      const why = last
        ? last.ran
          ? `The last attempt DID complete (${last.transfers_seen ?? 0} transfers seen, at ${escapeHtml(last.at)}) but no clean-pass stamp landed — that combination is a bug worth reporting.`
          : `Last attempt at ${escapeHtml(last.at)}: <strong>${escapeHtml(last.reason ?? "no reason recorded")}</strong>. A failed pass retries next hour and never advances the cursor; nothing is lost, but the cap stays on until one completes.`
        : `No attempt has recorded a result yet — if the hourly cron is running, the next result lands within the hour.`;
      return `<p>${ATTENTION} — no clean Solana pass recorded yet. Until one lands, the unreconciled cap stays conservative by design. ${why}</p>`;
    }
    const age = now.getTime() - new Date(chain.solanaLastOk).getTime();
    const stale = !Number.isFinite(age) || age > CHAIN_STALE_MS;
    const last = chain.solanaLastResult;
    return `<p>${stale ? ATTENTION : PASS} — last clean Solana pass ${escapeHtml(chain.solanaLastOk)}${stale ? " (stale: the hourly audit has missed its window)" : ""}.
      ${last ? `Last run: ${last.ran ? `${last.transfers_seen ?? 0} transfer${(last.transfers_seen ?? 0) === 1 ? "" : "s"} seen` : `did not run (${escapeHtml(last.reason ?? "no reason recorded")})`} at ${escapeHtml(last.at)}.` : ""}</p>`;
  })();
  const base = chain.baseCursor
    ? `<p>${PASS} — Base cursor at block ${escapeHtml(chain.baseCursor)}; it only advances on a clean pass, so an advancing cursor IS the verdict. Anything found on-chain that the books can't explain pages the keeper instead of waiting here.</p>`
    : `<p>${ATTENTION} — no clean Base pass recorded yet.</p>`;
  const polygon = (() => {
    if (chain.polygonCursor) {
      return `<p>${PASS} — Polygon cursor at block ${escapeHtml(chain.polygonCursor)}; same rule as Base, an advancing cursor IS the verdict.</p>`;
    }
    const last = chain.polygonLastResult;
    if (last && !last.ran && !last.failed) {
      // A benign skip (rail not configured here) is a fact, not a fire.
      return `<p>Polygon walk: not running — ${escapeHtml(last.reason ?? "no reason recorded")} (as of ${escapeHtml(last.at)}).</p>`;
    }
    if (last && last.failed) {
      return `<p>${ATTENTION} — the Polygon walk's last attempt FAILED at ${escapeHtml(last.at)}: <strong>${escapeHtml(last.reason ?? "no reason recorded")}</strong>. A failed pass retries next hour and never advances the cursor.</p>`;
    }
    return `<p>${ATTENTION} — no clean Polygon pass recorded yet. Real money settles on this rail; until a pass lands, its incoming transfers are unwatched.</p>`;
  })();
  /**
   * The holes (ledger #22): block ranges the walk moved past without
   * reading. Rendered even at zero, because "no known holes" is a
   * claim this page is now entitled to make — before the record
   * existed, silence here meant nothing at all.
   */
  const skippedRecord = chain.baseSkipped;
  const holes = !skippedRecord
    ? `<p>${ATTENTION} — the skipped-range record didn't load; Base coverage cannot be stated either way. Reload to retry.</p>`
    : skippedRecord.total_ranges === 0
      ? `<p>${PASS} — no skipped Base block ranges on record: every block from the walk's first pass to the cursor was actually read.</p>`
      : holesHtml(skippedRecord);
  return `${base}${polygon}${holes}${solana}`;
}

/**
 * THE HOLES, WITH THE BUTTON THAT CLOSES THEM (2026-09-04). A hole
 * stays on the ledger forever — it is the record that the walk
 * skipped it — but once the back-fill has read every block of it the
 * verdict changes: the range was read, late, and the page says so
 * with the counts. The header goes PASS only when no block on the
 * ledger is still unread; a hole mid-way through its back-fill is
 * still a hole.
 */
function holesHtml(record: SkippedRangesRecord): string {
  const unread = unreadBlocks(record);
  const listed = record.ranges.length;
  const header =
    unread === 0
      ? `<p>${PASS} — ${record.total_ranges} hole${record.total_ranges === 1 ? "" : "s"} on record, all back-filled: ${record.total_blocks} blocks the walk skipped have since been read for incoming transfers, so every block from the first pass to the cursor has now been read. The ranges stay listed as history.</p>`
      : `<p>${ATTENTION} — the bank walk has ${record.total_ranges} hole${record.total_ranges === 1 ? "" : "s"} on record (${unread} of ${record.total_blocks} skipped blocks still NEVER read for incoming transfers — a payment in one is invisible to every instrument here until the range is back-filled). Each press reads up to 60,000 blocks and pages any orphan exactly as the hourly walk would:</p>`;
  const rows = record.ranges.map((range) => holeRowHtml(range)).join("\n");
  const cap =
    record.total_ranges > listed
      ? `<p><small>Only the most recent ${listed} ranges are listed; the totals above count every hole ever recorded.</small></p>`
      : "";
  return `${header}<ul>${rows}</ul>${cap}`;
}

function holeRowHtml(range: SkippedBlockRange): string {
  const chainLabel = range.chain && range.chain !== "eip155:8453" ? ` on ${escapeHtml(range.chain)}` : "";
  const bounds = `blocks ${range.from_block}\u2013${range.to_block}${chainLabel} (${range.blocks} blocks), cursor moved past them ${escapeHtml(range.recorded_at)}`;
  const button = (label: string): string =>
    `<form method="post" action="/admin/reconciliation/backfill" style="display:inline;margin-left:0.5em">
      <input type="hidden" name="from_block" value="${range.from_block}">
      <input type="hidden" name="to_block" value="${range.to_block}">
      <input type="hidden" name="chain" value="${escapeHtml(range.chain ?? "eip155:8453")}">
      <button type="submit">${label}</button>
    </form>`;
  const progress = range.backfill;
  if (progress?.completed_at) {
    return `<li>${bounds} — <strong>BACK-FILLED</strong> ${escapeHtml(progress.completed_at)}: ${progress.transfers_seen} transfer${progress.transfers_seen === 1 ? "" : "s"} seen, ${progress.orphans} orphan${progress.orphans === 1 ? "" : "s"}${progress.orphans > 0 ? " (paged; see the alarm trail below)" : ""}${progress.cert_scan_truncated ? " — the certificate scan hit its cap during the read, so an orphan here may be a false alarm" : ""}.</li>`;
  }
  if (progress) {
    const read = progress.read_to - range.from_block + 1;
    return `<li>${bounds} — back-fill under way: read to block ${progress.read_to} (${read} of ${range.blocks} blocks), ${progress.transfers_seen} transfer${progress.transfers_seen === 1 ? "" : "s"} seen, ${progress.orphans} orphan${progress.orphans === 1 ? "" : "s"} so far.${button("Continue the back-fill")}</li>`;
  }
  return `<li>${bounds}${button("Back-fill this hole")}</li>`;
}

function deliveriesHtml(
  audit: (DeliveryAudit & { house_payers?: Record<string, boolean> }) | null,
): string {
  if (!audit) return `<p>${ATTENTION} — the delivery audit didn't load. Reload to retry.</p>`;
  if (audit.undelivered.length === 0) {
    return `<p>${PASS} — every settle either delivered its goods or is in flight
      (${audit.in_flight} in flight, ${audit.checked} checked${audit.truncated ? "; scan capped, count is a floor" : ""}).</p>`;
  }
  const rows = audit.undelivered
    .map((sale) => {
      const house = sale.payer
        ? (audit.house_payers?.[sale.payer] ?? false)
        : false;
      return `<li>${escapeHtml(sale.path)} — $${sale.paid_usdc} settled ${escapeHtml(sale.settled_at)}${sale.transaction ? `, tx ${escapeHtml(sale.transaction)}` : ""}${
        house
          ? ` <strong>[HOUSE WALLET]</strong> — the store's own money bought this and the artifact never minted; nobody outside is owed anything. "House money, absorbed" closes it honestly.`
          : sale.payer
            ? ` — paid by ${escapeHtml(sale.payer)}, a real buyer: fulfill or refund, never absorb.`
            : ""
      }
      ${
        /*
         * CAN THIS ONE ACTUALLY BE FULFILLED? The page offered
         * "fulfilled by hand" for months on rows where fulfilling was
         * impossible, because the store had not recorded what the
         * buyer asked for. Saying so is the difference between a
         * choice and a trap.
         */
        sale.query
          ? `<div><small><strong>They asked for:</strong> <code>${escapeHtml(sale.query)}</code> — enough to produce the goods, so this one can be FULFILLED.</small></div>`
          : `<div><small><strong style="color:#8c2f1b">What they asked for was not recorded</strong> — settled before 2026-08-10, when the request stopped being thrown away. There is no way to know what artifact to make, so this one can only be REFUNDED.</small></div>`
      }
      <form method="POST" action="/admin/delivery/resolve" style="margin:0.3em 0">
        <input type="hidden" name="transaction" value="${escapeHtml(sale.transaction ?? "")}">
        <select name="outcome" required>
          ${house ? `<option value="house_absorbed">house money, absorbed</option>` : ""}
          <option value="fulfilled_by_hand">fulfilled by hand</option>
          <option value="refunded">refunded</option>
          ${house ? "" : `<option value="house_absorbed">house money, absorbed</option>`}
        </select>
        <button type="submit">Resolve this one</button>
      </form></li>`;
    })
    .join("\n");
  return `<p>${ATTENTION} — ${audit.undelivered.length} settle${audit.undelivered.length === 1 ? "" : "s"} took money without recorded goods.
    <small>What this means mechanically: the settle succeeded and then the
    fulfillment step — the certificate, the recorded goods — never wrote,
    so the buyer paid and holds nothing. For an instant item that is a
    half-finished purchase, not a missing shipment. Resolve inline below;
    the record keeps the original intent inside it.</small></p>
    <ul>${rows}</ul>`;
}

function alertsHtml(
  alerts: AlertLogEntry[],
  lastRead: string | null,
): string {
  if (alerts.length === 0) {
    return `<p>${PASS} — the alarm log is quiet (30-day window).</p>`;
  }
  /*
   * "HAVE I SEEN THIS ONE?" ANSWERED BY THE PAGE, NOT BY MEMORY.
   *
   * The keeper's words: eyeballing every row to work out what is new
   * is too much work, and he is right — a trail you have to
   * re-read in full to use is a trail that stops getting used, which
   * is how the 3am forensics happened in the first place.
   *
   * The watermark moves when he loads this page, so the marker means
   * "since you last looked" rather than "since some date you have to
   * remember."
   */
  const fresh = alerts.filter((alert) => alert.is_new).length;
  const rows = alerts
    .map(
      (alert) =>
        `<li>${alert.is_new ? `<strong style="background:#ffe9a8">[NEW]</strong> ` : ""}${
          alert.now
            ? alert.now === "still open"
              ? `<strong style="color:#8c2f1b">[STILL OPEN]</strong> `
              : `<strong style="color:#2f6b2f">[${escapeHtml(
                  // Name the outcome. "Resolved by hand" alone cannot
                  // be checked against the money that actually moved.
                  alert.now === "resolved by hand" && alert.resolved_as
                    ? `resolved: ${alert.resolved_as.replace(/_/g, " ")}`
                    : alert.now,
                ).toUpperCase()}]</strong> `
            : ""
        }<strong>${escapeHtml(alert.condition)}</strong> first seen ${escapeHtml(alert.at)}${
          /*
           * STANDING, NOT RECURRING, and the difference is the whole
           * reason this line exists. A row that has been raised forty
           * times is ONE problem nobody has fixed. Until 2026-08-10 it
           * rendered as forty separate rows with forty different
           * timestamps, which is how a keeper doing 3am forensics ends
           * up cross-checking six page loads against a transaction
           * hash to learn that nothing new had happened.
           */
          (alert.repeats ?? 1) > 1
            ? ` <em>(still being raised — seen ${alert.repeats} times, last ${escapeHtml(alert.last_seen ?? alert.at)})</em>`
            : ""
        }: ${escapeHtml(alert.detail)}${
          alert.now === "still open" && alert.tx
            ? `<form method="POST" action="/admin/delivery/resolve" style="margin:0.3em 0">
                <input type="hidden" name="transaction" value="${escapeHtml(alert.tx)}">
                <select name="outcome" required>
                  <option value="house_absorbed">house money, absorbed</option>
                  <option value="fulfilled_by_hand">fulfilled by hand</option>
                  <option value="refunded">refunded</option>
                </select>
                <button type="submit">Resolve this one</button>
              </form>`
            : ""
        }</li>`,
    )
    .join("\n");
  return `<p><strong>${
    lastRead === null
      ? "First look at this trail — the mark starts now."
      : fresh === 0
        ? `Nothing new since you last looked (${escapeHtml(lastRead.slice(0, 16))}Z).`
        : `${fresh} NEW since you last looked (${escapeHtml(lastRead.slice(0, 16))}Z).`
  }</strong> Loading this page moves that mark, so next time "new" means new again.
    ${
      lastRead === null
        ? `<small>Nothing is marked NEW on a first look: the store has no idea
      what you have already read, and flagging all of it would be a lie the
      size of the whole list.</small>`
        : ""
    }</p>
    <p>Recent alarms — each paged the keeper when it fired. This is the
    trail, not the pager: an entry marked resolved or delivered is HISTORY,
    already handled, kept so the record shows it happened. Only [STILL OPEN]
    needs a hand.</p>
    <p><small>ONE ROW PER PROBLEM. The date is when it FIRST fired and it
    never moves; a condition still standing shows its repeat count instead
    of appearing again lower down. Before 2026-08-10 an unresolved alarm
    minted a fresh row every six hours, so the same event read as several,
    the newest crowded genuinely distinct ones off the list, and the page
    got less trustworthy the longer it went unread.</small></p>
    <ul>${rows}</ul>`;
}

export function renderReconciliationPage(
  data: ReconciliationPageData,
  now: Date,
): string {
  const body = `
  <section>
    <p>Every way this store audits its own money, one page, verdicts
    first. A quiet page and a quiet phone mean the same thing here.</p>
  </section>

  <section>
    <h2>Settle counters vs payer rows</h2>
    ${settlesHtml(data.settles)}
    ${certsHtml(data.certs, data.settles)}
  </section>

  <section>
    <h2>The chain vs the books</h2>
    <p><small>Both rails audited hourly against the receive wallets.
    Money on-chain the books can't explain — either direction — pages
    the keeper the hour it's found.</small></p>
    ${chainHtml(data.chain, now)}
  </section>

  <section>
    <h2>Money in vs goods out</h2>
    ${deliveriesHtml(data.deliveries)}
  </section>

  <section>
    <h2>The alarm trail</h2>
    ${alertsHtml(data.alerts, data.alertsLastRead)}
  </section>

  <section>
    <p><small>Deeper readings, kept off the main shelf: <a href="/admin/recount">the recount</a>
    (row-level settle audit) · <a href="/admin/census">the census</a> ·
    <a href="/admin/bell">the bell</a> · <a href="/admin/ward">the ward</a>
    (link health and outside witnesses).</small></p>
  </section>`;
  return renderAdminShell("reconciliation", body, data.loadNotes);
}
